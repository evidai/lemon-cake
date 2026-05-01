/**
 * 管理者向け 手数料収益 / Treasury / 出金 API
 *
 * GET  /api/admin/revenue/summary   — 累計手数料・期間別・ウォレット残高
 * GET  /api/admin/revenue/refills   — HOT_WALLET 自動補充履歴
 * GET  /api/admin/revenue/withdrawals — 出金履歴
 * POST /api/admin/revenue/withdraw  — HOT_WALLET → 任意アドレスへ出金
 * POST /api/admin/revenue/refill    — Treasury → HOT_WALLET 手動補充トリガー
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import { getWalletBalances, refillHotWalletIfNeeded, withdrawFromHotWallet } from "../lib/treasury.js";
import { runProviderPayouts } from "../workers/providerPayout.js";

export const adminRevenueRouter = new Hono();

adminRevenueRouter.use("*", adminAuth);

// ─── GET /daily ─── 過去 N 日の日次手数料収益 ─────────────────
adminRevenueRouter.get("/daily", async (c) => {
  const days = Math.min(parseInt(c.req.query("days") ?? "30", 10), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // PostgreSQL: date_trunc('day', "createdAt") でグループ化
  // Prisma だと raw query が一番きれい
  const rows = await prisma.$queryRaw<Array<{ day: Date; total: string; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           SUM("amountUsdc")::text       AS total,
           COUNT(*)::bigint              AS count
    FROM platform_revenues
    WHERE "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  // 0 日も埋めて連続させる
  const series: Array<{ date: string; revenueUsdc: string; chargeCount: number }> = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    d.setUTCHours(0, 0, 0, 0);
    const iso = d.toISOString().slice(0, 10);
    const row = rows.find(r => r.day.toISOString().slice(0, 10) === iso);
    series.push({
      date:        iso,
      revenueUsdc: row ? row.total : "0",
      chargeCount: row ? Number(row.count) : 0,
    });
  }

  return c.json({ days, series });
});

// ─── GET /summary ─────────────────────────────────────────────
adminRevenueRouter.get("/summary", async (c) => {
  // 全期間 / 今月 / 今日 の手数料合計
  const now      = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [allTime, thisMonth, today, withdrawnAgg, pendingProviderAgg] = await Promise.all([
    prisma.platformRevenue.aggregate({ _sum: { amountUsdc: true }, _count: true }),
    prisma.platformRevenue.aggregate({ _sum: { amountUsdc: true }, where: { createdAt: { gte: monthStart } } }),
    prisma.platformRevenue.aggregate({ _sum: { amountUsdc: true }, where: { createdAt: { gte: dayStart } } }),
    prisma.platformWithdrawal.aggregate({ _sum: { amountUsdc: true }, where: { status: "COMPLETED" } }),
    prisma.provider.aggregate({ _sum: { pendingPayoutUsdc: true }, _count: { _all: true } }),
  ]);

  const totalRevenue   = (allTime._sum.amountUsdc ?? new Decimal(0));
  const withdrawn      = (withdrawnAgg._sum.amountUsdc ?? new Decimal(0));
  const availableUsdc  = totalRevenue.sub(withdrawn);

  let wallet: Awaited<ReturnType<typeof getWalletBalances>> | null = null;
  let walletError: string | null = null;
  try {
    wallet = await getWalletBalances();
  } catch (e) {
    walletError = e instanceof Error ? e.message : String(e);
  }

  return c.json({
    revenue: {
      allTimeUsdc:   totalRevenue.toFixed(6),
      thisMonthUsdc: (thisMonth._sum.amountUsdc ?? new Decimal(0)).toFixed(6),
      todayUsdc:     (today._sum.amountUsdc ?? new Decimal(0)).toFixed(6),
      chargeCount:   allTime._count,
      withdrawnUsdc: withdrawn.toFixed(6),
      availableUsdc: availableUsdc.toFixed(6),
    },
    providerPayouts: {
      pendingTotalUsdc: (pendingProviderAgg._sum.pendingPayoutUsdc ?? new Decimal(0)).toFixed(6),
      providerCount:    pendingProviderAgg._count._all,
    },
    wallet,
    walletError,
    config: {
      defaultFeeBps: parseInt(process.env.PLATFORM_FEE_BPS ?? "1000", 10),
    },
  });
});

// ─── GET /refills ─────────────────────────────────────────────
adminRevenueRouter.get("/refills", async (c) => {
  const refills = await prisma.hotWalletRefill.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({
    refills: refills.map(r => ({
      id:                 r.id,
      amountUsdc:         r.amountUsdc.toFixed(6),
      fromAddress:        r.fromAddress,
      toAddress:          r.toAddress,
      txHash:             r.txHash,
      status:             r.status,
      failureReason:      r.failureReason,
      triggerBalanceUsdc: r.triggerBalanceUsdc?.toFixed(6) ?? null,
      thresholdUsdc:      r.thresholdUsdc?.toFixed(6) ?? null,
      createdAt:          r.createdAt.toISOString(),
      completedAt:        r.completedAt?.toISOString() ?? null,
    })),
  });
});

// ─── GET /withdrawals ─────────────────────────────────────────
adminRevenueRouter.get("/withdrawals", async (c) => {
  const ws = await prisma.platformWithdrawal.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return c.json({
    withdrawals: ws.map(w => ({
      id:            w.id,
      amountUsdc:    w.amountUsdc.toFixed(6),
      toAddress:     w.toAddress,
      txHash:        w.txHash,
      status:        w.status,
      failureReason: w.failureReason,
      createdAt:     w.createdAt.toISOString(),
      completedAt:   w.completedAt?.toISOString() ?? null,
    })),
  });
});

// ─── POST /refill (manual trigger) ────────────────────────────
adminRevenueRouter.post("/refill", async (c) => {
  const result = await refillHotWalletIfNeeded();
  return c.json(result);
});

// ─── POST /withdraw ───────────────────────────────────────────
adminRevenueRouter.post("/withdraw", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const toAddress  = (body?.toAddress as string | undefined)?.trim();
  const amountUsdc = (body?.amountUsdc as string | number | undefined);

  if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    throw new HTTPException(400, { message: "toAddress (0x...) is required" });
  }
  let amountDec: Decimal;
  try {
    amountDec = new Decimal(amountUsdc as string | number);
  } catch {
    throw new HTTPException(400, { message: "amountUsdc invalid" });
  }
  if (amountDec.lte(0)) throw new HTTPException(400, { message: "amountUsdc must be > 0" });

  // 出金可能額チェック (累計手数料 - 出金済み)
  const [revAgg, wdAgg] = await Promise.all([
    prisma.platformRevenue.aggregate({ _sum: { amountUsdc: true } }),
    prisma.platformWithdrawal.aggregate({ _sum: { amountUsdc: true }, where: { status: "COMPLETED" } }),
  ]);
  const available = (revAgg._sum.amountUsdc ?? new Decimal(0)).sub(wdAgg._sum.amountUsdc ?? new Decimal(0));
  if (amountDec.gt(available)) {
    throw new HTTPException(409, { message: `出金可能額 ${available.toFixed(6)} USDC を超えています` });
  }

  // adminId はミドルウェアでセット済み
  const adminId = (c as never as { get: (k: string) => string }).get("adminId");

  const wd = await prisma.platformWithdrawal.create({
    data: {
      amountUsdc:  amountDec,
      toAddress,
      status:      "PENDING",
      initiatedBy: adminId ?? "unknown",
    },
  });

  try {
    const { txHash } = await withdrawFromHotWallet({ toAddress, amountUsdc: amountDec.toFixed(6) });
    await prisma.platformWithdrawal.update({
      where: { id: wd.id },
      data:  { status: "COMPLETED", txHash, completedAt: new Date() },
    });
    return c.json({ id: wd.id, status: "COMPLETED", txHash, amountUsdc: amountDec.toFixed(6) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.platformWithdrawal.update({
      where: { id: wd.id },
      data:  { status: "FAILED", failureReason: msg.slice(0, 500) },
    });
    throw new HTTPException(500, { message: `Withdrawal failed: ${msg}` });
  }
});

// ─── GET /provider-settlements ─────────────────────────────────
// プロバイダー精算ステータス一覧 (admin Finance UI 用)
adminRevenueRouter.get("/provider-settlements", async (c) => {
  const providers = await prisma.provider.findMany({
    where:    { active: true },
    orderBy:  { pendingPayoutUsdc: "desc" },
    select: {
      id: true, name: true, walletAddress: true,
      pendingPayoutUsdc: true, totalPaidOutUsdc: true, createdAt: true,
    },
  });
  return c.json({
    providers: providers.map(p => ({
      id:                p.id,
      name:              p.name,
      walletAddress:     p.walletAddress,
      pendingPayoutUsdc: p.pendingPayoutUsdc.toFixed(6),
      totalPaidOutUsdc:  p.totalPaidOutUsdc.toFixed(6),
    })),
    config: {
      minPayoutUsdc: process.env.PROVIDER_MIN_PAYOUT_USDC ?? "1",
      cronHourUtc:   parseInt(process.env.PROVIDER_PAYOUT_CRON_HOUR_UTC ?? "0", 10),
    },
  });
});

// ─── GET /provider-payouts ─────────────────────────────────────
adminRevenueRouter.get("/provider-payouts", async (c) => {
  const payouts = await prisma.providerPayout.findMany({
    orderBy:  { createdAt: "desc" },
    take:     50,
    include:  { provider: { select: { name: true } } },
  });
  return c.json({
    payouts: payouts.map(p => ({
      id:            p.id,
      providerId:    p.providerId,
      providerName:  p.provider.name,
      amountUsdc:    p.amountUsdc.toFixed(6),
      txHash:        p.txHash,
      status:        p.status,
      failureReason: p.failureReason,
      periodFrom:    p.periodFrom.toISOString(),
      periodTo:      p.periodTo.toISOString(),
      chargeCount:   p.chargeCount,
      createdAt:     p.createdAt.toISOString(),
      completedAt:   p.completedAt?.toISOString() ?? null,
    })),
  });
});

// ─── POST /run-provider-payouts (manual trigger) ──────────────
adminRevenueRouter.post("/run-provider-payouts", async (c) => {
  const summary = await runProviderPayouts({ manual: true });
  return c.json(summary);
});
