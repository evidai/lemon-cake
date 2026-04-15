/**
 * AfterShip Webhook ハンドラー
 *
 * POST /api/webhooks/aftership
 *
 * AfterShip が「Delivered」ステータスを送信してきたら
 * VERIFYING → TAX_PENDING に遷移し、税務ステップへ進む。
 *
 * 署名検証: HMAC-SHA256（AfterShip ダッシュボードで設定）
 */

import { Hono } from "hono";
import { createHmac }    from "crypto";
import { prisma }        from "../../lib/prisma.js";
import { transitionState, type WorkflowContext } from "../../lib/workflow-engine.js";
import { getWorkflowQueue } from "../../lib/queue.js";

export const aftershipWebhookRouter = new Hono();

aftershipWebhookRouter.post("/", async (c) => {
  // ── 1. HMAC 署名検証 ──────────────────────────────────────
  const signature = c.req.header("Aftership-Hmac-Sha256");
  const rawBody   = await c.req.text();
  const secret    = process.env.AFTERSHIP_WEBHOOK_SECRET ?? "";

  if (secret && signature) {
    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (signature !== expected) {
      console.warn("[AfterShip] Invalid webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // ── 2. ペイロード解析 ─────────────────────────────────────
  let payload: {
    event: string;
    msg?: {
      tracking_number?: string;
      tag?:             string;  // "Delivered" | "InTransit" | etc.
      last_updated_at?: string;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Delivered イベントのみ処理
  if (payload.msg?.tag !== "Delivered") {
    return c.json({ ok: true, skipped: true, tag: payload.msg?.tag });
  }

  const trackingNumber = payload.msg.tracking_number;
  if (!trackingNumber) return c.json({ ok: true, skipped: true });

  // ── 3. trackingNumber で Workflow を検索 ──────────────────
  const workflows = await prisma.workflow.findMany({
    where: { state: "VERIFYING" },
  });

  const target = workflows.find(
    (wf) => (wf.context as unknown as WorkflowContext).trackingNumber === trackingNumber,
  );

  if (!target) {
    console.warn(`[AfterShip] No VERIFYING workflow for tracking: ${trackingNumber}`);
    return c.json({ ok: true, matched: false });
  }

  // ── 4. VERIFYING → TAX_PENDING に遷移 ────────────────────
  const ok = await transitionState(target.id, "VERIFYING", "TAX_PENDING", {
    deliveredAt: payload.msg.last_updated_at ?? new Date().toISOString(),
  });

  if (ok) {
    // タイムアウトジョブ削除
    try {
      const queue = getWorkflowQueue();
      const timeoutJob = await queue.getJob(`timeout-${target.id}`);
      await timeoutJob?.remove();
    } catch { /* ignore */ }

    // 次ステップ: TAX_PENDING
    await getWorkflowQueue().add(
      "tax",
      { workflowId: target.id, step: "TAX_PENDING" },
    );

    console.log(`[AfterShip] ✅ Delivered — workflow ${target.id} → TAX_PENDING`);
  }

  return c.json({ ok: true, workflowId: target.id, transitioned: ok });
});
