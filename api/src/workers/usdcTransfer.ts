/**
 * USDC送金ワーカー (BullMQ Worker)
 *
 * usdcTransferQueue からジョブを取り出し、以下を実行する:
 *   1. Charge レコードを取得
 *   2. Service → Provider の walletAddress を取得
 *   3. viem で Polygon USDC 送金
 *   4. Charge.status を COMPLETED に更新、txHash を記録
 *   5. Provider.pendingPayoutUsdc を加算
 *
 * 失敗時（最大3回リトライ後）:
 *   - Charge.status を FAILED に更新
 *   - Buyer の残高を返金（ロールバック的処理）
 */

import { Worker, type Job } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { sendUsdcOnPolygon } from "../lib/usdc.js";
import {
  createRedisConnection,
  USDC_TRANSFER_QUEUE,
  type UsdcTransferJobData,
} from "../lib/queue.js";
import { Decimal } from "@prisma/client/runtime/library";

// ─── ワーカー起動 ─────────────────────────────────────────────
export function startUsdcTransferWorker(): Worker {
  const worker = new Worker<UsdcTransferJobData>(
    USDC_TRANSFER_QUEUE,
    processJob,
    {
      connection:  createRedisConnection(),
      concurrency: 5,  // 同時処理ジョブ数
    },
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] ✅ Job ${job.id} completed — chargeId: ${job.data.chargeId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] ❌ Job ${job?.id} failed — chargeId: ${job?.data.chargeId}`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker error:", err);
  });

  console.log("[Worker] 🔧 usdcTransferWorker started");
  return worker;
}

// ─── ジョブ処理本体 ───────────────────────────────────────────
async function processJob(job: Job<UsdcTransferJobData>): Promise<void> {
  const { chargeId, serviceId, amountUsdc } = job.data;

  // サービスとプロバイダーのウォレットを取得
  const service = await prisma.service.findUnique({
    where:   { id: serviceId },
    include: { provider: true },
  });

  if (!service) {
    throw new Error(`Service not found: ${serviceId}`);
  }
  if (!service.provider.walletAddress) {
    throw new Error(`Provider wallet not set for service: ${serviceId}`);
  }

  // Charge が PENDING 状態か確認（二重送金防止）
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge) {
    throw new Error(`Charge not found: ${chargeId}`);
  }
  if (charge.status !== "PENDING") {
    console.warn(`[Worker] Charge ${chargeId} is already ${charge.status}, skipping`);
    return;
  }

  // ジョブ進捗を記録
  await job.updateProgress(10);
  console.log(`[Worker] 🚀 Sending ${amountUsdc} USDC to ${service.provider.walletAddress}`);

  // Polygon USDC 送金
  const { txHash } = await sendUsdcOnPolygon({
    toAddress:  service.provider.walletAddress,
    amountUsdc,
  });

  await job.updateProgress(80);
  console.log(`[Worker] 📝 txHash: ${txHash}`);

  // Charge を COMPLETED に更新 + Provider の受取残高を加算
  const amountDecimal = new Decimal(amountUsdc);

  await prisma.$transaction([
    prisma.charge.update({
      where: { id: chargeId },
      data:  {
        status:    "COMPLETED",
        txHash,
      },
    }),
    prisma.provider.update({
      where: { id: service.providerId },
      data:  {
        pendingPayoutUsdc: { increment: amountDecimal },
      },
    }),
  ]);

  // ── freee 仕訳自動作成 ───────────────────────────────────────
  // 送金完了後に freee へ仕訳。失敗しても送金は確定済みなので catch で握りつぶす。
  try {
    const { createFreeeTransaction } = await import("../lib/freee.js");
    const { checkWithholdingTax }    = await import("../lib/tax.js");
    const jpyRate   = Number(process.env.JPY_USDC_RATE ?? "150");
    const amountJpy = Math.round(Number(amountUsdc) * jpyRate);
    const withholding = checkWithholdingTax(service.name, amountJpy);

    await createFreeeTransaction({
      issueDate:         new Date().toISOString().slice(0, 10),
      description:       `${service.name} API利用料`,
      amountUsdc,
      amountJpy,
      providerName:      service.provider.name,
      invoiceRegistered: false, // 国税庁 API 復活後に実照合へ変更予定
      ...(withholding.required ? {
        withholding: {
          required:     true,
          taxAmount:    withholding.taxAmount,
          netAmount:    withholding.netAmount,
          evidenceHash: "",
        },
      } : {}),
    });
    console.log(`[Worker] 📒 freee 仕訳作成完了 — chargeId: ${chargeId}`);
  } catch (freeeErr) {
    console.error("[Worker] freee 仕訳作成失敗（送金は完了済み）:", freeeErr);
  }

  await job.updateProgress(100);
}

// ─── ワーカー失敗ハンドラー（最大リトライ消費後の補償処理）──
export async function handleFailedJob(
  job: Job<UsdcTransferJobData>,
  err: Error,
): Promise<void> {
  const { chargeId, buyerId, amountUsdc } = job.data;
  const amountDecimal = new Decimal(amountUsdc);

  console.error(`[Worker] 💀 Job permanently failed — chargeId: ${chargeId}`, err.message);

  try {
    await prisma.$transaction([
      // Charge を FAILED に
      prisma.charge.update({
        where: { id: chargeId },
        data:  {
          status:        "FAILED",
          failureReason: err.message.slice(0, 500),
        },
      }),
      // Buyer への残高返金（補償トランザクション）
      prisma.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: { increment: amountDecimal } },
      }),
    ]);
    console.log(`[Worker] ↩️  Refunded ${amountUsdc} USDC to buyer ${buyerId}`);
  } catch (rollbackErr) {
    console.error("[Worker] ⚠️  Rollback failed:", rollbackErr);
    // TODO: アラート通知 (Phase 3: PagerDuty / Slack webhook)
  }
}
