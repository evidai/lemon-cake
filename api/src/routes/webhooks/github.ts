/**
 * GitHub Webhook ハンドラー — 自律型外注・バウンティ Recipe
 *
 * POST /api/webhooks/github
 *
 * PR がマージされたとき:
 *   1. コントリビューターの居住地を GitHub API で確認
 *   2. 日本個人事業主なら源泉徴収 (10.21%) を計算
 *   3. freee 会計に「外注費」として仕訳を自動作成
 *
 * 署名検証: X-Hub-Signature-256 (HMAC-SHA256)
 * 環境変数: GITHUB_WEBHOOK_SECRET, GITHUB_TOKEN, GITHUB_BOUNTY_USDC
 */

import { Hono }       from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { checkWithholdingTax, hashEvidence } from "../../lib/tax.js";
import { createFreeeTransaction }            from "../../lib/freee.js";

export const githubWebhookRouter = new Hono();

// 処理済みPRの記録（再起動でリセットされるが二重送金を防ぐ主要手段）
// key: "{repoFullName}#{prNumber}", value: processedAt timestamp
const processedPRs = new Map<string, number>();
const PR_TTL_MS = 24 * 60 * 60 * 1000; // 24時間

// ─── POST /api/webhooks/github ────────────────────────────────
githubWebhookRouter.post("/", async (c) => {
  const rawBody  = await c.req.text();
  const event    = c.req.header("X-GitHub-Event");
  const signature = c.req.header("X-Hub-Signature-256");

  // ── 1. HMAC 署名検証（timing-safe比較）────────────────────
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!secret) {
    console.error("[GitHub] GITHUB_WEBHOOK_SECRET is not set — rejecting all webhooks");
    return c.json({ error: "Webhook secret not configured" }, 503);
  }
  if (secret && signature) {
    const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
    // timing-safe比較でタイミング攻撃を防ぐ
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        console.warn("[GitHub] Invalid webhook signature");
        return c.json({ error: "Invalid signature" }, 401);
      }
    } catch {
      return c.json({ error: "Invalid signature" }, 401);
    }
  } else {
    // secretが設定されているのにsignatureがない場合は拒否
    console.warn("[GitHub] Missing X-Hub-Signature-256 header");
    return c.json({ error: "Missing signature" }, 401);
  }

  // ── 2. PR マージイベントのみ処理 ─────────────────────────
  if (event !== "pull_request") return c.json({ ok: true, skipped: true });

  let payload: {
    action?:       string;
    pull_request?: {
      merged?:   boolean;
      title?:    string;
      number?:   number;
      user?: {
        login?:    string;
        location?: string | null;
      };
      html_url?: string;
    };
    repository?: { full_name?: string };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const pr = payload.pull_request;
  if (payload.action !== "closed" || !pr?.merged) {
    return c.json({ ok: true, skipped: true, reason: "not merged" });
  }

  const login    = pr.user?.login ?? "unknown";
  const prTitle  = pr.title ?? `PR #${pr.number}`;
  const repoName = payload.repository?.full_name ?? "";
  const prKey    = `${repoName}#${pr.number}`;

  // ── 冪等性チェック: 同じPRを2回処理しない ───────────────
  // 古いエントリを掃除
  const now = Date.now();
  for (const [k, ts] of processedPRs) {
    if (now - ts > PR_TTL_MS) processedPRs.delete(k);
  }
  if (processedPRs.has(prKey)) {
    console.log(`[GitHub] PR ${prKey} already processed — skipping (idempotency)`);
    return c.json({ ok: true, skipped: true, reason: "already_processed" });
  }
  // 処理開始前にマーク（処理失敗時も再送しない設計）
  processedPRs.set(prKey, now);

  console.log(`[GitHub] PR merged: ${repoName}#${pr.number} by @${login}`);

  // ── 3. コントリビューター属性照合 ────────────────────────
  const isJapanIndividual = await detectJapanIndividual(login, pr.user?.location);

  // ── 4. 報酬金額設定 ──────────────────────────────────────
  const bountyUsdc = Number(process.env.GITHUB_BOUNTY_USDC ?? "50");
  const jpyRate    = Number(process.env.JPY_USDC_RATE ?? "150");
  const amountJpy  = Math.round(bountyUsdc * jpyRate);

  // ── 5. 源泉徴収判定 ──────────────────────────────────────
  // 日本個人かつプログラミング等の役務はデフォルト源泉不要だが、
  // デザイン・翻訳等は 204 条対象。PR タイトルでキーワード検索。
  const withholdingResult = isJapanIndividual
    ? checkWithholdingTax(prTitle, amountJpy)
    : { required: false, taxAmount: 0, netAmount: amountJpy, rate: 0, grossAmount: amountJpy };

  const evidenceHash = hashEvidence({ login, prTitle, repoName, isJapanIndividual, withholdingResult });

  // ── 6. freee 仕訳作成 ─────────────────────────────────────
  try {
    const result = await createFreeeTransaction({
      issueDate:         new Date().toISOString().slice(0, 10),
      description:       `外注費: ${prTitle} (@${login}) — ${repoName}`,
      amountUsdc:        bountyUsdc.toFixed(6),
      amountJpy,
      providerName:      login,
      invoiceRegistered: false, // 個人コントリビューターは通常インボイス未登録
      ...(withholdingResult.required ? {
        withholding: {
          required:     true,
          taxAmount:    withholdingResult.taxAmount,
          netAmount:    withholdingResult.netAmount,
          evidenceHash,
        },
      } : {}),
    });

    console.log(`[GitHub] 📒 freee 仕訳作成完了 — dealId: ${result.dealId}`);
    return c.json({
      ok:          true,
      login,
      prTitle,
      bountyUsdc,
      amountJpy,
      isJapanIndividual,
      withholding: withholdingResult.required,
      taxAmount:   withholdingResult.taxAmount,
      netAmount:   withholdingResult.netAmount,
      freeeDealId: result.dealId,
      freeeUrl:    result.url,
    });

  } catch (err) {
    console.error("[GitHub] freee 仕訳作成失敗:", err);
    return c.json({
      ok:          false,
      login,
      error:       (err as Error).message,
      bountyUsdc,
      amountJpy,
      isJapanIndividual,
      withholding: withholdingResult.required,
    }, 500);
  }
});

// ─── 日本個人事業主判定 ───────────────────────────────────────
async function detectJapanIndividual(
  login:            string,
  locationFromEvent: string | null | undefined,
): Promise<boolean> {
  // イベントペイロードに location が含まれる場合はそれを使う
  if (locationFromEvent !== undefined) {
    return isJapanLocation(locationFromEvent ?? "");
  }

  // GitHub API で取得（GITHUB_TOKEN がある場合）
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept":        "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    const user = await res.json() as { location?: string | null; type?: string };
    // Organization ではなく Individual かつ Japan
    if (user.type === "Organization") return false;
    return isJapanLocation(user.location ?? "");
  } catch {
    return false;
  }
}

function isJapanLocation(location: string): boolean {
  const loc = location.toLowerCase();
  return loc.includes("japan") || loc.includes("jp") || loc.includes("日本") || loc.includes("東京") ||
    loc.includes("osaka") || loc.includes("tokyo") || loc.includes("kyoto") || loc.includes("大阪");
}
