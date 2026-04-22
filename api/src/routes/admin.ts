/**
 * GET /api/admin/stats — 管理者ダッシュボード用 KPI
 *
 * 総チャージ額（これまでに入金された総額）を中心に、
 * Buyer/Service/Charge の集計値を返す。
 *
 * 計算式:
 *   totalDepositedUsdc = SUM(buyer.balanceUsdc) + SUM(buyer.heldUsdc) + SUM(charge.amountUsdc WHERE status=confirmed)
 *   - 残高 + 拘束中 + 課金済み = これまでに入金された総額（引き出しなし前提）
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyAdminToken } from "../lib/jwt.js";

async function requireAdmin(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return "Authorization header missing";
  const valid = await verifyAdminToken(authHeader.slice(7));
  return valid ? null : "Invalid or expired token";
}

export const adminRouter = new OpenAPIHono();

const StatsSchema = z
  .object({
    totalDepositedUsdc: z.string().describe("これまでに入金された総USDC (残高+拘束+課金済み)"),
    totalChargedUsdc:   z.string().describe("COMPLETED 状態の課金合計"),
    totalBalanceUsdc:   z.string().describe("Buyer の現在残高合計"),
    totalHeldUsdc:      z.string().describe("Buyer の拘束中USDC合計"),
    buyerCount:         z.number().int(),
    serviceCount:       z.number().int(),
    confirmedChargeCount: z.number().int(),
  })
  .openapi("AdminStats");

const getStatsRoute = createRoute({
  method: "get",
  path:   "/stats",
  summary: "管理者ダッシュボード KPI",
  tags: ["admin"],
  security: [{ Bearer: [] }],
  responses: {
    200: { description: "OK", content: { "application/json": { schema: StatsSchema } } },
    401: { description: "Unauthorized" },
  },
});

adminRouter.openapi(getStatsRoute, async (c) => {
  const err = await requireAdmin(c.req.header("Authorization"));
  if (err) return c.json({ error: err }, 401) as any;

  const [buyerAgg, chargeAgg, buyerCount, serviceCount] = await Promise.all([
    prisma.buyer.aggregate({
      _sum: { balanceUsdc: true, heldUsdc: true },
    }),
    prisma.charge.aggregate({
      where: { status: "COMPLETED" },
      _sum: { amountUsdc: true },
      _count: true,
    }),
    prisma.buyer.count(),
    prisma.service.count(),
  ]);

  const balance  = buyerAgg._sum.balanceUsdc ?? 0;
  const held     = buyerAgg._sum.heldUsdc    ?? 0;
  const charged  = chargeAgg._sum.amountUsdc ?? 0;

  // Prisma Decimal → string 加算
  const toNum = (v: any) => Number(v?.toString?.() ?? v ?? 0);
  const totalDeposited = toNum(balance) + toNum(held) + toNum(charged);

  return c.json({
    totalDepositedUsdc:   totalDeposited.toFixed(6),
    totalChargedUsdc:     toNum(charged).toFixed(6),
    totalBalanceUsdc:     toNum(balance).toFixed(6),
    totalHeldUsdc:        toNum(held).toFixed(6),
    buyerCount,
    serviceCount,
    confirmedChargeCount: chargeAgg._count ?? 0,
  });
});
