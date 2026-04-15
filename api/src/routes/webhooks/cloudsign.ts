/**
 * CloudSign Webhook ハンドラー
 *
 * POST /api/webhooks/cloudsign
 *
 * CloudSign が署名完了時に送信する Webhook を受け取り、
 * CONTRACTING → ORDER_LOCKED に遷移して次のステップへ進む。
 *
 * 署名検証: X-CloudSign-Signature ヘッダー（HMAC-SHA256）
 */

import { Hono } from "hono";
import { createHmac }    from "crypto";
import { prisma }        from "../../lib/prisma.js";
import { transitionState, type WorkflowContext } from "../../lib/workflow-engine.js";
import { getWorkflowQueue } from "../../lib/queue.js";

export const cloudsignWebhookRouter = new Hono();

cloudsignWebhookRouter.post("/", async (c) => {
  // ── 1. HMAC 署名検証 ──────────────────────────────────────
  const signature = c.req.header("X-CloudSign-Signature");
  const rawBody   = await c.req.text();
  const secret    = process.env.CLOUDSIGN_WEBHOOK_SECRET ?? "";

  if (secret && signature) {
    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    if (signature !== expected) {
      console.warn("[CloudSign] Invalid webhook signature");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // ── 2. ペイロード解析 ─────────────────────────────────────
  let payload: { event: string; document: { id: string; status: string } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // 署名完了イベントのみ処理
  if (payload.event !== "document.completed" || payload.document?.status !== "completed") {
    return c.json({ ok: true, skipped: true });
  }

  const docId = payload.document.id;

  // ── 3. contractDocId で Workflow を検索 ───────────────────
  const workflows = await prisma.workflow.findMany({
    where: { state: "CONTRACTING" },
  });

  const target = workflows.find(
    (wf) => (wf.context as unknown as WorkflowContext).contractDocId === docId,
  );

  if (!target) {
    console.warn(`[CloudSign] No CONTRACTING workflow found for docId: ${docId}`);
    return c.json({ ok: true, matched: false });
  }

  // ── 4. CONTRACTING → ORDER_LOCKED に遷移 ─────────────────
  const ok = await transitionState(target.id, "CONTRACTING", "ORDER_LOCKED", {
    contractSignedAt: new Date().toISOString(),
  });

  if (ok) {
    // タイムアウトジョブを削除
    try {
      const queue = getWorkflowQueue();
      const timeoutJob = await queue.getJob(`timeout-${target.id}`);
      await timeoutJob?.remove();
    } catch { /* ignore */ }

    // 次ステップ: ORDER_LOCKED（発注 + 資金ロック）
    await getWorkflowQueue().add(
      "order",
      { workflowId: target.id, step: "ORDER_LOCKED" },
    );

    console.log(`[CloudSign] ✅ Contract signed — workflow ${target.id} → ORDER_LOCKED`);
  }

  return c.json({ ok: true, workflowId: target.id, transitioned: ok });
});
