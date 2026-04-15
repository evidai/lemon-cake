/**
 * E2E Workflow ステートマシン
 *
 * 状態遷移の定義と、各ステップの実行ロジック。
 * BullMQ ワーカーから呼ばれる。
 */

import { prisma } from "./prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import type { WorkflowState } from "@prisma/client";

// ─── コンテキスト型 ──────────────────────────────────────────
export interface WorkflowContext {
  // ── 入力（エージェントが POST 時に渡す） ──
  vendorName:                  string;
  vendorEmail:                 string;
  invoiceRegistrationNumber?:  string;  // T + 13桁
  contractTitle:               string;
  orderDetails: {
    serviceType:   "PRINT" | "MATERIALS" | "CLOUD" | "FREELANCE";
    description:   string;
    serviceId?:    string;  // Raksul等のLemon cake Service ID
  };
  amountUsdc:  string;  // e.g. "100.000000"
  amountJpy:   number;

  // ── Step 2: CONTRACTING ──
  contractDocId?:    string;   // CloudSign doc ID
  contractSentAt?:   string;   // ISO timestamp
  contractSignedAt?: string;   // ISO timestamp（Webhook受信時に記録）

  // ── Step 3: ORDER_LOCKED ──
  orderId?:          string;   // Raksul/MonotaRo order ID
  orderPlacedAt?:    string;

  // ── Step 4: VERIFYING ──
  trackingNumber?:   string;
  trackingCarrier?:  string;
  deliveredAt?:      string;   // ISO timestamp（AfterShip Webhook）

  // ── Step 5: TAX_PENDING ──
  taxResult?: {
    isQualified:  boolean;
    withholding:  boolean;
    taxAmount:    number;   // JPY
    netAmount:    number;   // JPY（差引後）
    evidenceHash: string;
  };

  // ── Step 6: PAYING ──
  chargeId?: string;

  // ── Step 7: BOOKKEEPING ──
  freeeDealId?: number;
  freeeUrl?:    string;
}

// ─── 状態遷移マップ ──────────────────────────────────────────
const TRANSITIONS: Record<WorkflowState, WorkflowState | null> = {
  RESEARCH:      "CONTRACTING",
  CONTRACTING:   "ORDER_LOCKED",   // CloudSign Webhook で遷移
  ORDER_LOCKED:  "VERIFYING",      // 発注後、AfterShip 監視開始
  VERIFYING:     "TAX_PENDING",    // AfterShip Webhook で遷移
  TAX_PENDING:   "PAYING",
  PAYING:        "BOOKKEEPING",
  BOOKKEEPING:   "COMPLETED",
  COMPLETED:     null,
  FAILED:        null,
  CANCELLED:     null,
};

export function nextState(current: WorkflowState): WorkflowState | null {
  return TRANSITIONS[current];
}

// ─── ワークフロー取得 ────────────────────────────────────────
export async function getWorkflow(id: string) {
  return prisma.workflow.findUnique({
    where:   { id },
    include: { buyer: true },
  });
}

// ─── 状態を安全に遷移（楽観的ロック） ──────────────────────
export async function transitionState(
  workflowId:  string,
  fromState:   WorkflowState,
  toState:     WorkflowState,
  contextPatch: Partial<WorkflowContext> = {},
): Promise<boolean> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.state !== fromState) return false;  // 既に遷移済み

  const merged = { ...(workflow.context as unknown as WorkflowContext), ...contextPatch };

  await prisma.workflow.update({
    where: { id: workflowId },
    data:  { state: toState, context: merged },
  });
  return true;
}

// ─── USDC 与信ロック ─────────────────────────────────────────
export async function lockFunds(workflowId: string): Promise<void> {
  const wf = await prisma.workflow.findUnique({
    where:   { id: workflowId },
    include: { buyer: true },
  });
  if (!wf) throw new Error("Workflow not found");

  const amount = new Decimal((wf.context as unknown as WorkflowContext).amountUsdc);
  if (wf.buyer.balanceUsdc.lessThan(amount)) {
    throw new Error(`Insufficient balance: ${wf.buyer.balanceUsdc} USDC available`);
  }

  await prisma.$transaction([
    prisma.buyer.update({
      where: { id: wf.buyerId },
      data:  {
        balanceUsdc: { decrement: amount },
        heldUsdc:    { increment: amount },
      },
    }),
    prisma.workflow.update({
      where: { id: workflowId },
      data:  { heldUsdc: amount },
    }),
  ]);
}

// ─── 与信ロック解除（キャンセル・失敗時の返金） ─────────────
export async function releaseFunds(workflowId: string): Promise<void> {
  const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!wf || wf.heldUsdc.isZero()) return;

  await prisma.$transaction([
    prisma.buyer.update({
      where: { id: wf.buyerId },
      data:  {
        balanceUsdc: { increment: wf.heldUsdc },
        heldUsdc:    { decrement: wf.heldUsdc },
      },
    }),
    prisma.workflow.update({
      where: { id: workflowId },
      data:  { heldUsdc: 0 },
    }),
  ]);
}

// ─── ワークフローを FAILED に ────────────────────────────────
export async function failWorkflow(workflowId: string, reason: string): Promise<void> {
  await releaseFunds(workflowId);
  await prisma.workflow.update({
    where: { id: workflowId },
    data:  { state: "FAILED", error: reason.slice(0, 500) },
  });
}
