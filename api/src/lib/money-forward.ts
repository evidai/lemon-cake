/**
 * Money Forward クラウド会計 API 連携
 *
 * freee.ts と対称の実装。決済完了後、自動的に取引を作成する。
 * 源泉徴収が発生した場合は預り金として科目按分。
 *
 * 前提:
 * - MF_CLIENT_ID:      Money Forward アプリのクライアントID
 * - MF_CLIENT_SECRET:  Money Forward アプリのクライアントシークレット
 * - MF_ACCESS_TOKEN:   OAuthアクセストークン
 * - MF_REFRESH_TOKEN:  リフレッシュトークン
 * - MF_OFFICE_ID:      事業所ID（Money Forward では office_id と呼ぶ）
 *
 * API Docs: https://biz.moneyforward.com/support/expense/faq/api/a004.html
 * OAuth 2.0 endpoint: https://api.biz.moneyforward.com/authorize
 */

const MF_API_BASE  = "https://api.biz.moneyforward.com/api/v1";
const MF_AUTH_BASE = "https://api.biz.moneyforward.com";

// ─── OAuth トークン取得 ──────────────────────────────────────
export async function refreshMFToken(refreshToken: string): Promise<{
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
}> {
  // MF は CLIENT_SECRET_BASIC 指定なので Authorization ヘッダーで送る
  const basic = Buffer.from(
    `${process.env.MF_CLIENT_ID ?? ""}:${process.env.MF_CLIENT_SECRET ?? ""}`,
  ).toString("base64");
  const res = await fetch(`${MF_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Money Forward token refresh failed: ${res.status}`);
  const data = await res.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresIn:    data.expires_in,
  };
}

// ─── トークンリフレッシュ + DB 永続化 ────────────────────────
export async function refreshAndPersistMFToken(): Promise<string> {
  const refreshToken = process.env.MF_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("MF_REFRESH_TOKEN が未設定");

  const tokens = await refreshMFToken(refreshToken);

  // メモリ上の環境変数を更新
  process.env.MF_ACCESS_TOKEN  = tokens.accessToken;
  process.env.MF_REFRESH_TOKEN = tokens.refreshToken;

  // DB の Service.authHeader を更新
  try {
    const { prisma } = await import("./prisma.js");
    await prisma.service.updateMany({
      where:  { endpoint: { contains: "api.biz.moneyforward.com" } },
      data:   { authHeader: `Bearer ${tokens.accessToken}` },
    });
    console.log("[MF] Token refreshed and persisted to DB");
  } catch (err) {
    console.error("[MF] Failed to persist token to DB:", err);
  }

  return tokens.accessToken;
}

// ─── 取引作成パラメータ（freee.ts と同一シグネチャ）─────────
export interface CreateMFTransactionParams {
  issueDate:          string;  // "YYYY-MM-DD"
  description:        string;  // 摘要
  amountUsdc:         string;  // 決済額 (USDC)
  amountJpy:          number;  // 円換算額
  providerName:       string;  // 支払い先名
  invoiceRegistered:  boolean; // 適格請求書発行事業者かどうか
  withholding?: {
    required:    boolean;
    taxAmount:   number;       // 源泉税額 (JPY)
    netAmount:   number;       // 差引き額 (JPY)
    evidenceHash: string;      // 国税庁API照合証跡ハッシュ
  };
}

// ─── Money Forward 取引作成 ──────────────────────────────────
// Money Forward API では「仕訳伝票 (journals)」エンドポイントを使う。
// 構造は freee とほぼ同じだが、キー名が snake_case + 異なる命名:
//   entry_side "debit"/"credit" → side "debit"/"credit"（同じ）
//   account_item_name → item_name
//   details → journal_lines
export async function createMFTransaction(params: CreateMFTransactionParams): Promise<{
  journalId: string;
  url:       string;
}> {
  const accessToken = process.env.MF_ACCESS_TOKEN;
  const officeId    = process.env.MF_OFFICE_ID;
  if (!accessToken || !officeId) {
    throw new Error("MF_ACCESS_TOKEN または MF_OFFICE_ID が未設定");
  }

  const memo = [
    params.description,
    `USDC: ${params.amountUsdc}`,
    `国税庁API照合: ${params.invoiceRegistered ? "適格事業者 ✓" : "非適格 ✗"}`,
    params.withholding?.evidenceHash
      ? `Evidence Hash: ${params.withholding.evidenceHash.slice(0, 16)}...`
      : null,
  ].filter(Boolean).join(" | ");

  const journal_lines: object[] = [];

  if (params.withholding?.required) {
    // 源泉徴収あり: 外注費 / 預り金 / 普通預金
    journal_lines.push(
      {
        item_name:   "外注費",
        tax_name:    params.invoiceRegistered ? "課税仕入 10%" : "対象外",
        amount:      params.amountJpy,
        side:        "debit",
        description: memo,
      },
      {
        item_name:   "預り金",
        amount:      params.withholding.taxAmount,
        side:        "credit",
        description: `源泉所得税（${(params.withholding.taxAmount / params.amountJpy * 100).toFixed(2)}%）`,
      },
      {
        item_name:   "普通預金",
        amount:      params.withholding.netAmount,
        side:        "credit",
        description: `${params.providerName} への支払い（差引後）`,
      },
    );
  } else {
    // 源泉徴収なし: 通信費 / 普通預金
    journal_lines.push(
      {
        item_name:   "通信費",
        tax_name:    params.invoiceRegistered ? "課税仕入 10%" : "対象外",
        amount:      params.amountJpy,
        side:        "debit",
        description: memo,
      },
      {
        item_name:   "普通預金",
        amount:      params.amountJpy,
        side:        "credit",
        description: `${params.providerName} への支払い`,
      },
    );
  }

  const body = {
    office_id:     officeId,
    issue_date:    params.issueDate,
    journal_lines,
  };

  const doPost = (token: string) => fetch(`${MF_API_BASE}/journals`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let res = await doPost(accessToken);

  if (res.status === 401) {
    console.log("[MF] createMFTransaction 401 — attempting token refresh");
    const newToken = await refreshAndPersistMFToken();
    res = await doPost(newToken);
  }

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[MF] API error: ${res.status}`, errBody);
    throw new Error(`Money Forward API エラー: ${res.status}`);
  }

  const data = await res.json() as { journal: { id: string } };
  const journalId = data.journal.id;

  return {
    journalId,
    url: `https://biz.moneyforward.com/accounting/journal/${journalId}`,
  };
}

// ─── Money Forward OAuth 認可URL生成 ─────────────────────────
export function getMFAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.MF_CLIENT_ID ?? "",
    redirect_uri:  process.env.MF_REDIRECT_URI ?? "http://localhost:3002/api/money-forward/callback",
    scope:         "mfc/invoice/data.write mfc/invoice/data.read office.read",
    state,
  });
  return `${MF_AUTH_BASE}/authorize?${params}`;
}

// ─── Money Forward 認可コード → トークン交換 ─────────────────
export async function exchangeMFCode(code: string): Promise<{
  accessToken:  string;
  refreshToken: string;
}> {
  const redirectUri = process.env.MF_REDIRECT_URI ?? "http://localhost:3002/api/money-forward/callback";
  // MF は CLIENT_SECRET_BASIC — id/secret は Authorization ヘッダーへ
  const basic = Buffer.from(
    `${process.env.MF_CLIENT_ID ?? ""}:${process.env.MF_CLIENT_SECRET ?? ""}`,
  ).toString("base64");
  const res = await fetch(`${MF_AUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Money Forward code exchange failed: ${res.status} — ${body}`);
  const data = JSON.parse(body) as {
    access_token: string; refresh_token: string;
  };
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
  };
}

// ─── 統合ディスパッチャ: freee or MF を設定に応じて使い分け ──
// 環境変数 ACCOUNTING_PROVIDER=freee|moneyforward|both で選択。
// "both" の場合は両方に仕訳を作成し、失敗側はログのみで握りつぶす。
export async function createAccountingEntry(
  params: CreateMFTransactionParams,
): Promise<{ freeeId?: number; mfId?: string; urls: string[] }> {
  const provider = process.env.ACCOUNTING_PROVIDER ?? "freee";
  const urls: string[] = [];
  let freeeId: number | undefined;
  let mfId: string | undefined;

  if (provider === "freee" || provider === "both") {
    try {
      const { createFreeeTransaction } = await import("./freee.js");
      const r = await createFreeeTransaction(params);
      freeeId = r.dealId;
      urls.push(r.url);
    } catch (err) {
      console.error("[accounting] freee side failed:", err);
      if (provider === "freee") throw err;
    }
  }

  if (provider === "moneyforward" || provider === "both") {
    try {
      const r = await createMFTransaction(params);
      mfId = r.journalId;
      urls.push(r.url);
    } catch (err) {
      console.error("[accounting] Money Forward side failed:", err);
      if (provider === "moneyforward") throw err;
    }
  }

  return { freeeId, mfId, urls };
}
