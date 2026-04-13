/**
 * Proprietary Agent Reputation System
 *
 * Maintains a trust score (0–100) for each agent based on:
 *   - Transaction success rate
 *   - Transaction volume and consistency
 *   - Risk history (weighted moving average of risk scores)
 *   - Account age bonus
 *   - Compliance tier bonus
 *
 * Score interpretation:
 *   0–20  : Untrusted / suspended
 *   21–40 : Low trust (new or problematic agents)
 *   41–60 : Neutral (default for new agents)
 *   61–80 : Trusted
 *   81–100: Highly trusted
 */

import prisma from "./prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReputationSummary {
  agentId: string;
  trustScore: number;
  tier: "untrusted" | "low" | "neutral" | "trusted" | "highly_trusted";
  totalSent: number;
  totalReceived: number;
  successRate: number;
  avgTxAmount: number;
  avgRiskScore: number;
  lastActivityAt: Date;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Ensure an AgentReputation and AgentBudget row exist for a given agent.
 * Call this after creating a new Agent.
 */
export async function bootstrapAgent(agentId: string): Promise<void> {
  await Promise.all([
    prisma.agentReputation.upsert({
      where: { agentId },
      create: { agentId },
      update: {},
    }),
    prisma.agentBudget.upsert({
      where: { agentId },
      create: { agentId },
      update: {},
    }),
  ]);
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * Recompute and persist the trust score for an agent.
 * Call this after each confirmed or failed transaction.
 */
export async function updateReputation(agentId: string, latestRiskScore: number): Promise<void> {
  const [rep, agent, txHistory] = await Promise.all([
    prisma.agentReputation.findUnique({ where: { agentId } }),
    prisma.agent.findUnique({ where: { id: agentId }, select: { createdAt: true, complianceTier: true } }),
    prisma.transaction.findMany({
      where: { fromAgentId: agentId },
      select: { status: true, amount: true, riskScore: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!rep || !agent) return;

  const total = txHistory.length;
  const confirmed = txHistory.filter((t) => t.status === "confirmed").length;
  const failed = txHistory.filter((t) => t.status === "failed").length;
  const successRate = total > 0 ? confirmed / total : 1.0;
  const amounts = txHistory.filter((t) => t.status === "confirmed").map((t) => t.amount);
  const avgTxAmount = amounts.length > 0 ? amounts.reduce((s, v) => s + v, 0) / amounts.length : 0;

  // Weighted moving average of risk scores (most recent = higher weight)
  const riskScores = txHistory.map((t) => t.riskScore);
  riskScores.unshift(latestRiskScore); // prepend latest
  const weightedRisk = riskScores.slice(0, 100).reduce((acc, v, i) => {
    const weight = 1 / (i + 1); // most recent has weight 1, then 0.5, 0.33, ...
    return acc + v * weight;
  }, 0) / riskScores.slice(0, 100).reduce((acc, _, i) => acc + 1 / (i + 1), 0);

  // Account age bonus: up to +10 points for agents > 30 days old
  const ageMs = Date.now() - agent.createdAt.getTime();
  const ageDays = ageMs / 86_400_000;
  const ageBonus = Math.min(10, ageDays / 3);

  // Compliance tier bonus
  const tierBonus: Record<string, number> = { none: 0, kya: 10, kyc: 20 };
  const complianceBonus = tierBonus[agent.complianceTier] ?? 0;

  // Success rate component (0–40 points)
  const successComponent = successRate * 40;

  // Volume component: log scale, up to 20 points for 100+ confirmed txs
  const volumeComponent = Math.min(20, Math.log10(Math.max(1, confirmed)) * 10);

  // Risk penalty: subtract weighted avg risk score * 0.5 (0–50 penalty)
  const riskPenalty = weightedRisk * 0.5;

  // Failure penalty: extra deduction for high failure rate
  const failureRate = total > 0 ? failed / total : 0;
  const failurePenalty = failureRate * 20;

  const rawScore =
    successComponent +
    volumeComponent +
    ageBonus +
    complianceBonus -
    riskPenalty -
    failurePenalty;

  const trustScore = Math.max(0, Math.min(100, rawScore));

  await prisma.agentReputation.update({
    where: { agentId },
    data: {
      trustScore,
      totalSent: total,
      totalReceived: rep.totalReceived, // updated separately on incoming txs
      successRate,
      avgTxAmount,
      avgRiskScore: weightedRisk,
      lastActivityAt: new Date(),
    },
  });
}

/**
 * Increment the received counter when an agent receives a confirmed payment.
 */
export async function recordIncoming(agentId: string): Promise<void> {
  await prisma.agentReputation.update({
    where: { agentId },
    data: { totalReceived: { increment: 1 }, lastActivityAt: new Date() },
  });
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getReputation(agentId: string): Promise<ReputationSummary | null> {
  const rep = await prisma.agentReputation.findUnique({ where: { agentId } });
  if (!rep) return null;

  const score = rep.trustScore;
  let tier: ReputationSummary["tier"];
  if (score <= 20) tier = "untrusted";
  else if (score <= 40) tier = "low";
  else if (score <= 60) tier = "neutral";
  else if (score <= 80) tier = "trusted";
  else tier = "highly_trusted";

  return {
    agentId,
    trustScore: score,
    tier,
    totalSent: rep.totalSent,
    totalReceived: rep.totalReceived,
    successRate: rep.successRate,
    avgTxAmount: rep.avgTxAmount,
    avgRiskScore: rep.avgRiskScore,
    lastActivityAt: rep.lastActivityAt,
  };
}
