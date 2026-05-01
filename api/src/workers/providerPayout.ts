/**
 * ProviderPayout バッチ送金
 *
 * pendingPayoutUsdc >= PROVIDER_MIN_PAYOUT_USDC のプロバイダーをすべて拾い、
 * HOT_WALLET から1プロバイダーあたり1tx で送金する。
 *
 * トリガー:
 *   - 日次 cron (PROVIDER_PAYOUT_CRON_HOUR_UTC, default: 0 = 09:00 JST)
 *   - 管理者の手動実行 (/api/admin/revenue/run-provider-payouts)
 *
 * 環境変数:
 *   PROVIDER_MIN_PAYOUT_USDC   — 最低送金額 (default: "1")
 *   PROVIDER_PAYOUT_CRON_HOUR_UTC — 何時(UTC)に走らせるか (default: "0")
 */

import { prisma } from "../lib/prisma.js";
import { sendUsdcOnPolygon } from "../lib/usdc.js";
import { Decimal } from "@prisma/client/runtime/library";

interface PayoutResult {
  providerId:    string;
  providerName:  string;
  amountUsdc:    string;
  status:        "COMPLETED" | "FAILED" | "SKIPPED";
  txHash?:       string;
  error?:        string;
  payoutId?:     string;
}

interface RunSummary {
  ranAt:           string;
  providersScanned: number;
  payoutsAttempted: number;
  succeeded:       number;
  failed:          number;
  totalSentUsdc:   string;
  results:         PayoutResult[];
}

function getMinPayout(): Decimal {
  return new Decimal(process.env.PROVIDER_MIN_PAYOUT_USDC ?? "1");
}

// 1 tx あたりの推定ガス代 (USDC換算)。Polygon USDC transfer は ~50k gas、
// 30 gwei × $0.5/MATIC で ~$0.001、安全側に $0.005 を default
function getGasEstimateUsdc(): Decimal {
  return new Decimal(process.env.PAYOUT_GAS_ESTIMATE_USDC ?? "0.005");
}

// 「ガス代が payout の何%以下なら採算 OK か」のしきい値 (default 5%)
// payout >= gas × (100 / MAX_GAS_PCT) なら通す
function getMaxGasPct(): number {
  const v = parseFloat(process.env.PAYOUT_MAX_GAS_PCT ?? "5");
  return v > 0 && v < 100 ? v : 5;
}

// ─── 1プロバイダー分の送金処理 ───────────────────────────────
async function payoutOne(providerId: string, periodFrom: Date, periodTo: Date): Promise<PayoutResult> {
  // トランザクションで pendingPayoutUsdc を 0 にしつつ ProviderPayout レコード作成
  // (二重送金防止: status=PENDING で予約 → 送金成功時に COMPLETED)
  const minPayout    = getMinPayout();
  const gasEstimate  = getGasEstimateUsdc();
  const maxGasPct    = getMaxGasPct();
  // 採算ガード: payout × maxGasPct/100 >= gas → ガス代が許容率を超える場合スキップ
  const gasGuardMin  = gasEstimate.mul(100).div(maxGasPct);
  const effectiveMin = minPayout.gt(gasGuardMin) ? minPayout : gasGuardMin;

  const reservation = await prisma.$transaction(async (tx) => {
    const p = await tx.provider.findUnique({
      where: { id: providerId },
      select: { id: true, name: true, walletAddress: true, pendingPayoutUsdc: true },
    });
    if (!p) throw new Error("Provider not found");
    if (p.pendingPayoutUsdc.lt(effectiveMin)) {
      console.log(`[Payout] ⏭️  ${p.name} skipped: pending=${p.pendingPayoutUsdc.toFixed(6)} < ${effectiveMin.toFixed(6)} (gas guard ${maxGasPct}%)`);
      return null;
    }

    // 期間内に COMPLETED した Charge 数を数える (情報用)
    const chargeCount = await tx.charge.count({
      where: {
        service: { providerId },
        status: "COMPLETED",
        createdAt: { gte: periodFrom, lt: periodTo },
      },
    });

    const payout = await tx.providerPayout.create({
      data: {
        providerId:  p.id,
        amountUsdc:  p.pendingPayoutUsdc,
        periodFrom,
        periodTo,
        chargeCount,
        status:      "PENDING",
      },
    });
    // pendingPayoutUsdc を 0 にリセット (送金失敗時はロールバックで戻す)
    await tx.provider.update({
      where: { id: p.id },
      data:  { pendingPayoutUsdc: new Decimal(0) },
    });
    return { payout, provider: p };
  });

  if (!reservation) {
    return { providerId, providerName: "", amountUsdc: "0", status: "SKIPPED" };
  }

  const { payout, provider } = reservation;
  const amountStr = payout.amountUsdc.toFixed(6);

  console.log(`[Payout] 🚀 ${provider.name} ← ${amountStr} USDC (${payout.chargeCount} charges)`);

  try {
    const { txHash } = await sendUsdcOnPolygon({
      toAddress:  provider.walletAddress,
      amountUsdc: amountStr,
    });

    await prisma.$transaction([
      prisma.providerPayout.update({
        where: { id: payout.id },
        data:  { status: "COMPLETED", txHash, completedAt: new Date() },
      }),
      prisma.provider.update({
        where: { id: provider.id },
        data:  { totalPaidOutUsdc: { increment: payout.amountUsdc } },
      }),
    ]);

    console.log(`[Payout] ✅ ${provider.name}: ${txHash}`);
    return {
      providerId:   provider.id,
      providerName: provider.name,
      amountUsdc:   amountStr,
      status:       "COMPLETED",
      txHash,
      payoutId:     payout.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 送金失敗時は pendingPayoutUsdc を戻す + ProviderPayout を FAILED に
    await prisma.$transaction([
      prisma.providerPayout.update({
        where: { id: payout.id },
        data:  { status: "FAILED", failureReason: msg.slice(0, 500) },
      }),
      prisma.provider.update({
        where: { id: provider.id },
        data:  { pendingPayoutUsdc: { increment: payout.amountUsdc } },
      }),
    ]);
    console.error(`[Payout] ❌ ${provider.name}:`, msg);
    return {
      providerId:   provider.id,
      providerName: provider.name,
      amountUsdc:   amountStr,
      status:       "FAILED",
      error:        msg,
      payoutId:     payout.id,
    };
  }
}

// ─── 全 provider 走査 ─────────────────────────────────────────
export async function runProviderPayouts(opts?: { manual?: boolean }): Promise<RunSummary> {
  const startedAt    = new Date();
  const minPayout    = getMinPayout();
  const gasEstimate  = getGasEstimateUsdc();
  const maxGasPct    = getMaxGasPct();
  const gasGuardMin  = gasEstimate.mul(100).div(maxGasPct);
  const effectiveMin = minPayout.gt(gasGuardMin) ? minPayout : gasGuardMin;

  // 期間 = 前回 cron から今回まで (簡易版: 「直近24時間」)
  const periodTo   = new Date();
  const periodFrom = new Date(periodTo.getTime() - 24 * 60 * 60 * 1000);

  const candidates = await prisma.provider.findMany({
    where:  { active: true, pendingPayoutUsdc: { gte: effectiveMin } },
    select: { id: true, name: true, pendingPayoutUsdc: true, walletAddress: true },
  });

  console.log(`[Payout] ${opts?.manual ? "🔧 manual" : "⏰ scheduled"} run @ ${startedAt.toISOString()} — ${candidates.length} provider(s) >= ${effectiveMin.toFixed(6)} USDC (min=${minPayout.toFixed(6)}, gas guard=${maxGasPct}%)`);

  const results: PayoutResult[] = [];
  let totalSent = new Decimal(0);

  // 直列処理 (HOT_WALLET の nonce 衝突を避けるため)
  for (const c of candidates) {
    const r = await payoutOne(c.id, periodFrom, periodTo);
    results.push(r);
    if (r.status === "COMPLETED") totalSent = totalSent.add(new Decimal(r.amountUsdc));
  }

  const summary: RunSummary = {
    ranAt:            startedAt.toISOString(),
    providersScanned: candidates.length,
    payoutsAttempted: results.filter(r => r.status !== "SKIPPED").length,
    succeeded:        results.filter(r => r.status === "COMPLETED").length,
    failed:           results.filter(r => r.status === "FAILED").length,
    totalSentUsdc:    totalSent.toFixed(6),
    results,
  };

  console.log(`[Payout] 📊 done — sent: $${summary.totalSentUsdc}, success: ${summary.succeeded}, failed: ${summary.failed}`);
  return summary;
}

// ─── Cron スケジューラー (24h 間隔) ──────────────────────────
let cronTimer: NodeJS.Timeout | null = null;

export function startProviderPayoutCron(): NodeJS.Timeout {
  const targetHourUtc = parseInt(process.env.PROVIDER_PAYOUT_CRON_HOUR_UTC ?? "0", 10);

  function scheduleNext() {
    const now    = new Date();
    const next   = new Date(now);
    next.setUTCHours(targetHourUtc, 0, 0, 0);
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    const delayMs = next.getTime() - now.getTime();
    console.log(`[PayoutCron] next run @ ${next.toISOString()} (${(delayMs / 3600000).toFixed(2)}h)`);

    cronTimer = setTimeout(async () => {
      try {
        await runProviderPayouts();
      } catch (e) {
        console.error("[PayoutCron] error:", e);
      } finally {
        scheduleNext();
      }
    }, delayMs);
    cronTimer.unref();
  }

  scheduleNext();
  return cronTimer!;
}

export function stopProviderPayoutCron(): void {
  if (cronTimer) clearTimeout(cronTimer);
}
