import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { getCircuitSummary, openCircuitCount } from "../lib/circuit-breaker";

const router = Router();

/**
 * GET /api/stats
 *
 * Returns:
 *   - recentTps      : confirmed tx count in the last 1 second
 *   - totalTx        : cumulative transaction count (all statuses)
 *   - blockedTx      : transactions blocked by fraud detection
 *   - flaggedTx      : transactions flagged for review
 *   - openFraudFlags : count of unresolved fraud flags
 *   - suspendedAgents: count of currently suspended agents
 *   - avgRiskScore   : average risk score of last 100 confirmed txs
 *   - recentLogs     : latest 50 transactions (newest first)
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const oneSecondAgo = new Date(Date.now() - 1_000);

    const [
      recentTps,
      totalTx,
      blockedTx,
      flaggedTx,
      openFraudFlags,
      suspendedAgents,
      totalAgents,
      tierCounts,
      recentRiskTxs,
      recentLogs,
    ] = await Promise.all([
      prisma.transaction.count({
        where: { status: "confirmed", createdAt: { gte: oneSecondAgo } },
      }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: "blocked" } }),
      prisma.transaction.count({ where: { flagged: true } }),
      prisma.fraudFlag.count({ where: { resolved: false } }),
      prisma.agentBudget.count({ where: { suspended: true } }),
      prisma.agent.count(),
      prisma.agent.groupBy({
        by: ["complianceTier"],
        _count: { complianceTier: true },
      }),
      prisma.transaction.findMany({
        where: { status: "confirmed" },
        select: { riskScore: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.transaction.findMany({
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          fromAgent: { select: { publicKey: true, complianceTier: true } },
          toAgent:   { select: { publicKey: true } },
        },
      }),
    ]);

    const avgRiskScore =
      recentRiskTxs.length > 0
        ? recentRiskTxs.reduce((s, t) => s + t.riskScore, 0) / recentRiskTxs.length
        : 0;

    const logs = recentLogs.map((tx) => ({
      id: tx.id,
      from: tx.fromAgent.publicKey,
      fromTier: tx.fromAgent.complianceTier,
      to: tx.toAgent.publicKey,
      amount: tx.amount,
      currency: tx.currency,
      txHash: tx.txHash,
      status: tx.status,
      riskScore: tx.riskScore,
      flagged: tx.flagged,
      flagReason: tx.flagReason,
      createdAt: tx.createdAt,
    }));

    const tierMap: Record<string, number> = {};
    for (const row of tierCounts) {
      tierMap[row.complianceTier] = row._count.complianceTier;
    }

    res.json({
      recentTps,
      totalTx,
      blockedTx,
      flaggedTx,
      openFraudFlags,
      suspendedAgents,
      totalAgents,
      tierCounts: {
        none: tierMap["none"] ?? 0,
        kya:  tierMap["kya"]  ?? 0,
        kyc:  tierMap["kyc"]  ?? 0,
      },
      avgRiskScore: parseFloat(avgRiskScore.toFixed(2)),
      openCircuits: openCircuitCount(),
      circuitBreakers: getCircuitSummary(),
      recentLogs: logs,
    });
  } catch (err) {
    console.error("[GET /api/stats]", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
