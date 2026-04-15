/**
 * E2E Workflow ステップワーカー
 *
 * workflow-step キューからジョブを取り出し、各ステップを実行する。
 *
 * 非同期待ちステップ (CONTRACTING / VERIFYING) はここでは実行しない。
 * それらは Webhook ハンドラーが直接 DB を更新し、次のジョブを投入する。
 */

import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createRedisConnection,
  WORKFLOW_QUEUE,
  getWorkflowQueue,
  type WorkflowStepJobData,
} from "../lib/queue.js";
import {
  getWorkflow,
  lockFunds,
  failWorkflow,
  transitionState,
  type WorkflowContext,
} from "../lib/workflow-engine.js";
import { checkInvoiceRegistration, checkWithholdingTax, hashEvidence } from "../lib/tax.js";
import { createFreeeTransaction } from "../lib/freee.js";

export function startWorkflowWorker(): Worker {
  const worker = new Worker<WorkflowStepJobData>(
    WORKFLOW_QUEUE,
    processWorkflowStep,
    {
      connection:  createRedisConnection(),
      concurrency: 3,
    },
  );

  worker.on("completed", (job) =>
    console.log(`[WorkflowWorker] ✅ ${job.data.step} completed — wf: ${job.data.workflowId}`),
  );
  worker.on("failed", (job, err) =>
    console.error(`[WorkflowWorker] ❌ ${job?.data.step} failed — wf: ${job?.data.workflowId}`, err.message),
  );

  console.log("[WorkflowWorker] 🔧 workflowStepWorker started");
  return worker;
}

// ─── ステップディスパッチャー ─────────────────────────────────
async function processWorkflowStep(job: Job<WorkflowStepJobData>): Promise<void> {
  const { workflowId, step } = job.data;

  const wf = await getWorkflow(workflowId);
  if (!wf) throw new Error(`Workflow not found: ${workflowId}`);
  if (wf.state !== step) {
    console.warn(`[WorkflowWorker] State mismatch: expected ${step}, got ${wf.state} — skipping`);
    return;
  }

  const ctx = wf.context as unknown as WorkflowContext;

  switch (step) {
    case "RESEARCH":     return stepResearch(wf, ctx);
    case "ORDER_LOCKED": return stepOrder(wf, ctx);
    case "TAX_PENDING":  return stepTax(wf, ctx);
    case "PAYING":       return stepPay(wf, ctx);
    case "BOOKKEEPING":  return stepBookkeeping(wf, ctx);
    default:
      console.warn(`[WorkflowWorker] No handler for step: ${step}`);
  }
}

// ─── Step 1: RESEARCH → CONTRACTING ─────────────────────────
// CloudSign 契約書を送信し、CONTRACTING 状態に遷移して Webhook 待ち。
async function stepResearch(wf: any, ctx: WorkflowContext): Promise<void> {
  if (!ctx.contractDocId) {
    throw new Error("contractDocId is required to proceed to CONTRACTING");
  }

  const ok = await transitionState(wf.id, "RESEARCH", "CONTRACTING", {
    contractSentAt: new Date().toISOString(),
  });
  if (!ok) return;

  // タイムアウトジョブ: 7日以内に署名されなければキャンセル
  await getWorkflowQueue().add(
    "timeout-check",
    { workflowId: wf.id, step: "CONTRACTING" },
    { delay: 7 * 24 * 60 * 60 * 1000, jobId: `timeout-${wf.id}` },
  );

  console.log(`[WorkflowWorker] 📄 Contract sent — waiting for signature (workflowId: ${wf.id})`);
}

// ─── Step 3: ORDER_LOCKED → VERIFYING ────────────────────────
// USDC 与信ロック、発注実行（エージェントが orderId をセット済み想定）、AfterShip 監視開始。
async function stepOrder(wf: any, ctx: WorkflowContext): Promise<void> {
  try {
    await lockFunds(wf.id);
  } catch (err) {
    await failWorkflow(wf.id, err instanceof Error ? err.message : "lockFunds failed");
    return;
  }

  if (!ctx.orderId) {
    await failWorkflow(wf.id, "orderId が未セット — エージェントが発注後に orderId をセットする必要があります");
    return;
  }

  const ok = await transitionState(wf.id, "ORDER_LOCKED", "VERIFYING", {
    orderPlacedAt: new Date().toISOString(),
  });
  if (!ok) return;

  // AfterShip 監視タイムアウト: 30日
  await getWorkflowQueue().add(
    "timeout-check",
    { workflowId: wf.id, step: "VERIFYING" },
    { delay: 30 * 24 * 60 * 60 * 1000, jobId: `timeout-${wf.id}` },
  );

  console.log(`[WorkflowWorker] 📦 Order placed — watching delivery (workflowId: ${wf.id})`);
}

// ─── Step 5: TAX_PENDING → PAYING ────────────────────────────
async function stepTax(wf: any, ctx: WorkflowContext): Promise<void> {
  let taxResult: WorkflowContext["taxResult"] = {
    isQualified: false,
    withholding:  false,
    taxAmount:    0,
    netAmount:    ctx.amountJpy,
    evidenceHash: "",
  };

  // 国税庁 API 照合
  if (ctx.invoiceRegistrationNumber) {
    try {
      const invoiceResult = await checkInvoiceRegistration(ctx.invoiceRegistrationNumber);
      const serviceDesc = ctx.orderDetails.serviceType === "FREELANCE"
        ? `デザイン ${ctx.orderDetails.description}`
        : ctx.orderDetails.description;
      const withholdingResult = checkWithholdingTax(serviceDesc, ctx.amountJpy);

      taxResult = {
        isQualified:  invoiceResult.isQualified,
        withholding:  withholdingResult.required,
        taxAmount:    withholdingResult.taxAmount,
        netAmount:    withholdingResult.netAmount,
        evidenceHash: hashEvidence(invoiceResult),
      };
    } catch (err) {
      console.warn("[WorkflowWorker] 国税庁 API 照合失敗、デフォルト税務判定を使用:", err);
    }
  }

  const ok = await transitionState(wf.id, "TAX_PENDING", "PAYING", { taxResult });
  if (!ok) return;

  // 即座に次ステップ（PAYING）へ
  await getWorkflowQueue().add("paying", { workflowId: wf.id, step: "PAYING" });
}

// ─── Step 6: PAYING → BOOKKEEPING ────────────────────────────
async function stepPay(wf: any, ctx: WorkflowContext): Promise<void> {
  const amountDecimal = new Decimal(ctx.amountUsdc);

  // held → 確定課金
  const chargeId = await prisma.$transaction(async (tx) => {
    const charge = await tx.charge.create({
      data: {
        buyerId:        wf.buyerId,
        serviceId:      ctx.orderDetails.serviceId ?? wf.id,  // フォールバック
        tokenId:        wf.id,  // ワークフローIDをダミートークンIDとして使用
        amountUsdc:     amountDecimal,
        idempotencyKey: `workflow-${wf.id}`,
        status:         "COMPLETED",
        riskScore:      0,
      },
    });
    await tx.buyer.update({
      where: { id: wf.buyerId },
      data:  { heldUsdc: { decrement: amountDecimal } },
    });
    await tx.workflow.update({
      where: { id: wf.id },
      data:  { heldUsdc: 0 },
    });
    return charge.id;
  });

  const ok = await transitionState(wf.id, "PAYING", "BOOKKEEPING", { chargeId });
  if (!ok) return;

  await getWorkflowQueue().add("bookkeeping", { workflowId: wf.id, step: "BOOKKEEPING" });
}

// ─── Step 7: BOOKKEEPING → COMPLETED ─────────────────────────
async function stepBookkeeping(wf: any, ctx: WorkflowContext): Promise<void> {
  let freeeDealId: number | undefined;
  let freeeUrl: string | undefined;

  try {
    const result = await createFreeeTransaction({
      issueDate:         ctx.deliveredAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      description:       `${ctx.orderDetails.description} (${ctx.vendorName})`,
      amountUsdc:        ctx.amountUsdc,
      amountJpy:         ctx.taxResult?.netAmount ?? ctx.amountJpy,
      providerName:      ctx.vendorName,
      invoiceRegistered: ctx.taxResult?.isQualified ?? false,
      ...(ctx.taxResult?.withholding ? {
        withholding: {
          required:     true,
          taxAmount:    ctx.taxResult.taxAmount,
          netAmount:    ctx.taxResult.netAmount,
          evidenceHash: ctx.taxResult.evidenceHash,
        },
      } : {}),
    });
    freeeDealId = result.dealId;
    freeeUrl    = result.url;
  } catch (err) {
    console.error("[WorkflowWorker] freee 仕訳作成失敗:", err);
    // 仕訳失敗でも決済は完了しているので COMPLETED に遷移
  }

  await transitionState(wf.id, "BOOKKEEPING", "COMPLETED", { freeeDealId, freeeUrl });
  console.log(`[WorkflowWorker] 🎉 Workflow ${wf.id} COMPLETED`);
}
