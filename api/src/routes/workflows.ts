/**
 * E2E Business Recipe ワークフロー API
 *
 * POST /api/workflows/e2e-procurement  — ワークフロー開始
 * GET  /api/workflows/:id              — 状態確認
 * PATCH /api/workflows/:id/context     — コンテキスト更新（エージェントからの非同期応答）
 * POST /api/workflows/:id/cancel       — キャンセル
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";
import { getWorkflowQueue } from "../lib/queue.js";
import { failWorkflow, releaseFunds, type WorkflowContext } from "../lib/workflow-engine.js";
import { HTTPException } from "hono/http-exception";
import { Decimal } from "@prisma/client/runtime/library";

export const workflowRouter = new Hono();

// ヘルパー: Hono コンテキストから buyerId を取得（型チェック回避）
function getBuyerId(c: any): string {
  return (c as never as { get: (k: string) => string }).get("buyerId");
}

// ─── スキーマ ─────────────────────────────────────────────────
const StartWorkflowBody = z.object({
  vendorName:                 z.string().min(1),
  vendorEmail:                z.string().email(),
  invoiceRegistrationNumber:  z.string().regex(/^T\d{13}$/).optional(),
  contractTitle:              z.string().min(1),
  orderDetails: z.object({
    serviceType:  z.enum(["PRINT", "MATERIALS", "CLOUD", "FREELANCE"]),
    description:  z.string().min(1),
    serviceId:    z.string().optional(),
  }),
  amountUsdc: z.string().regex(/^\d+\.\d{6}$/),
  amountJpy:  z.number().int().positive(),
  // エージェントが事前に CloudSign API を叩いて取得したdocId
  contractDocId: z.string().optional(),
});

// ─── POST /api/workflows/e2e-procurement ─────────────────────
workflowRouter.post(
  "/e2e-procurement",
  requireBuyerAuth,
  zValidator("json", StartWorkflowBody),
  async (c) => {
    const buyerId = getBuyerId(c);
    const body    = c.req.valid("json");

    // 残高チェック（ロックには足りるか）
    const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
    if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });

    if (buyer.balanceUsdc.lessThan(new Decimal(body.amountUsdc))) {
      throw new HTTPException(402, {
        message: `Insufficient balance: ${buyer.balanceUsdc.toFixed(6)} USDC available`,
      });
    }

    const context: WorkflowContext = {
      vendorName:                body.vendorName,
      vendorEmail:               body.vendorEmail,
      invoiceRegistrationNumber: body.invoiceRegistrationNumber,
      contractTitle:             body.contractTitle,
      orderDetails: {
        serviceType: body.orderDetails.serviceType,
        description: body.orderDetails.description,
        serviceId:   body.orderDetails.serviceId,
      },
      amountUsdc:    body.amountUsdc,
      amountJpy:     body.amountJpy,
      contractDocId: body.contractDocId,
    };

    const workflow = await prisma.workflow.create({
      data: {
        buyerId,
        type:    "E2E_PROCUREMENT",
        state:   "RESEARCH",
        context: context as unknown as Parameters<typeof prisma.workflow.create>[0]["data"]["context"],
        // 契約期限: 7日
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // RESEARCH ステップをキュー投入
    await getWorkflowQueue().add(
      "research",
      { workflowId: workflow.id, step: "RESEARCH" },
    );

    return c.json({
      workflowId: workflow.id,
      state:      workflow.state,
      message:    "ワークフローを開始しました。contractDocId が設定されていれば契約書の送信に進みます。",
    }, 201);
  },
);

// ─── GET /api/workflows/:id ───────────────────────────────────
workflowRouter.get("/:id", requireBuyerAuth, async (c) => {
  const buyerId    = getBuyerId(c);
  const workflowId = c.req.param("id");

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });
  if (workflow.buyerId !== buyerId) throw new HTTPException(403, { message: "Forbidden" });

  const ctx = workflow.context as unknown as WorkflowContext;

  return c.json({
    id:         workflow.id,
    state:      workflow.state,
    heldUsdc:   workflow.heldUsdc.toFixed(6),
    error:      workflow.error,
    expiresAt:  workflow.expiresAt,
    createdAt:  workflow.createdAt,
    updatedAt:  workflow.updatedAt,
    context: {
      vendorName:        ctx.vendorName,
      vendorEmail:       ctx.vendorEmail,
      contractTitle:     ctx.contractTitle,
      amountUsdc:        ctx.amountUsdc,
      amountJpy:         ctx.amountJpy,
      contractDocId:     ctx.contractDocId,
      contractSignedAt:  ctx.contractSignedAt,
      orderId:           ctx.orderId,
      trackingNumber:    ctx.trackingNumber,
      deliveredAt:       ctx.deliveredAt,
      taxResult:         ctx.taxResult,
      chargeId:          ctx.chargeId,
      freeeDealId:       ctx.freeeDealId,
      freeeUrl:          ctx.freeeUrl,
    },
  });
});

// ─── PATCH /api/workflows/:id/context ────────────────────────
// エージェントが非同期で contractDocId / orderId / trackingNumber を更新するエンドポイント
workflowRouter.patch(
  "/:id/context",
  requireBuyerAuth,
  zValidator("json", z.object({
    contractDocId:   z.string().optional(),
    orderId:         z.string().optional(),
    trackingNumber:  z.string().optional(),
    trackingCarrier: z.string().optional(),
  })),
  async (c) => {
    const buyerId    = getBuyerId(c);
    const workflowId = c.req.param("id");
    const patch      = c.req.valid("json");

    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });
    if (workflow.buyerId !== buyerId) throw new HTTPException(403, { message: "Forbidden" });

    const merged = { ...(workflow.context as unknown as WorkflowContext), ...patch };
    await prisma.workflow.update({
      where: { id: workflowId },
      data:  { context: merged as unknown as Parameters<typeof prisma.workflow.update>[0]["data"]["context"] },
    });

    // contractDocId がセットされ RESEARCH 状態なら次ステップを再実行
    if (patch.contractDocId && workflow.state === "RESEARCH") {
      await getWorkflowQueue().add(
        "research-retry",
        { workflowId, step: "RESEARCH" },
      );
    }

    return c.json({ workflowId, updated: Object.keys(patch) });
  },
);

// ─── POST /api/workflows/:id/cancel ──────────────────────────
workflowRouter.post("/:id/cancel", requireBuyerAuth, async (c) => {
  const buyerId    = getBuyerId(c);
  const workflowId = c.req.param("id");

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new HTTPException(404, { message: "Workflow not found" });
  if (workflow.buyerId !== buyerId) throw new HTTPException(403, { message: "Forbidden" });

  const terminal = ["COMPLETED", "FAILED", "CANCELLED"];
  if (terminal.includes(workflow.state)) {
    throw new HTTPException(409, { message: `Already in terminal state: ${workflow.state}` });
  }

  await releaseFunds(workflowId);
  await prisma.workflow.update({
    where: { id: workflowId },
    data:  { state: "CANCELLED", error: "手動キャンセル" },
  });

  return c.json({ workflowId, state: "CANCELLED" });
});
