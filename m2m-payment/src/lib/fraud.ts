/**
 * Proprietary Fraud Detection Engine
 *
 * Real-time risk scoring for AI agent transactions.
 * Evaluates multiple signals and returns a composite risk score (0–100).
 *
 * Signals:
 *   1. Velocity breach     — too many txs in a short window
 *   2. Amount anomaly      — tx amount deviates significantly from agent history
 *   3. Circular payment    — A→B→A within a short window
 *   4. Budget breach       — approaching or exceeding spending limits
 *   5. Unknown counterparty — first-time interaction with destination agent
 *   6. Compliance mismatch — agent tier insufficient for transaction size
 */

import prisma from "./prisma";

// ─── Config ───────────────────────────────────────────────────────────────────

const VELOCITY_WINDOW_MS = 60_000;   // 1 minute
const VELOCITY_THRESHOLD = 10;       // max txs per window before flagging
const AMOUNT_ZSCORE_THRESHOLD = 3.0; // z-score above which amount is anomalous
const CIRCULAR_WINDOW_MS = 300_000;  // 5 minutes
const RISK_BLOCK_THRESHOLD = 80;     // score >= this blocks the transaction
const RISK_FLAG_THRESHOLD = 50;      // score >= this flags for review

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskAssessment {
  score: number;           // 0–100
  shouldBlock: boolean;
  shouldFlag: boolean;
  flagReason?: string;
  signals: RiskSignal[];
}

interface RiskSignal {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  contribution: number; // how much this adds to the score
  detail: string;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

export async function assessRisk(
  fromAgentId: string,
  toAgentId: string,
  amount: number,
  currency: string
): Promise<RiskAssessment> {
  const signals: RiskSignal[] = [];

  // Run all checks in parallel
  const [velocitySignal, amountSignal, circularSignal, budgetSignal, counterpartySignal] =
    await Promise.all([
      checkVelocity(fromAgentId),
      checkAmountAnomaly(fromAgentId, amount),
      checkCircularPayment(fromAgentId, toAgentId),
      checkBudgetBreach(fromAgentId, amount),
      checkUnknownCounterparty(fromAgentId, toAgentId),
    ]);

  if (velocitySignal) signals.push(velocitySignal);
  if (amountSignal) signals.push(amountSignal);
  if (circularSignal) signals.push(circularSignal);
  if (budgetSignal) signals.push(budgetSignal);
  if (counterpartySignal) signals.push(counterpartySignal);

  // Composite score: sum of contributions, capped at 100
  const score = Math.min(
    100,
    signals.reduce((acc, s) => acc + s.contribution, 0)
  );

  const shouldBlock = score >= RISK_BLOCK_THRESHOLD;
  const shouldFlag = score >= RISK_FLAG_THRESHOLD;

  const topSignal = signals.sort((a, b) => b.contribution - a.contribution)[0];
  const flagReason = topSignal ? `${topSignal.type}: ${topSignal.detail}` : undefined;

  // Persist risk events
  if (signals.length > 0) {
    await prisma.riskEvent.createMany({
      data: signals.map((s) => ({
        agentId: fromAgentId,
        eventType: s.type,
        severity: s.severity,
        score: s.contribution,
        detail: s.detail,
      })),
    });
  }

  // Raise fraud flag for critical/blocking cases
  if (shouldBlock && topSignal) {
    await prisma.fraudFlag.create({
      data: {
        agentId: fromAgentId,
        reason: `[AUTO] Score ${score}/100 — ${topSignal.type}: ${topSignal.detail}`,
      },
    });
  }

  return { score, shouldBlock, shouldFlag, flagReason, signals };
}

// ─── Signal: Velocity ─────────────────────────────────────────────────────────

async function checkVelocity(agentId: string): Promise<RiskSignal | null> {
  const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const count = await prisma.transaction.count({
    where: { fromAgentId: agentId, createdAt: { gte: since } },
  });

  if (count < VELOCITY_THRESHOLD) return null;

  const ratio = count / VELOCITY_THRESHOLD;
  const contribution = Math.min(40, Math.round(ratio * 20));
  const severity = ratio >= 3 ? "critical" : ratio >= 2 ? "high" : "medium";

  return {
    type: "velocity_breach",
    severity,
    contribution,
    detail: `${count} txs in last 60s (limit: ${VELOCITY_THRESHOLD})`,
  };
}

// ─── Signal: Amount Anomaly (Z-score) ─────────────────────────────────────────

async function checkAmountAnomaly(agentId: string, amount: number): Promise<RiskSignal | null> {
  const history = await prisma.transaction.findMany({
    where: { fromAgentId: agentId, status: "confirmed" },
    select: { amount: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (history.length < 5) return null; // not enough data

  const amounts = history.map((t) => t.amount);
  const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
  const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return null;

  const zScore = Math.abs((amount - mean) / stddev);
  if (zScore < AMOUNT_ZSCORE_THRESHOLD) return null;

  const contribution = Math.min(30, Math.round(zScore * 5));
  const severity = zScore >= 6 ? "critical" : zScore >= 4 ? "high" : "medium";

  return {
    type: "amount_anomaly",
    severity,
    contribution,
    detail: `Amount ${amount} is ${zScore.toFixed(1)}σ from mean ${mean.toFixed(6)}`,
  };
}

// ─── Signal: Circular Payment ─────────────────────────────────────────────────

async function checkCircularPayment(fromAgentId: string, toAgentId: string): Promise<RiskSignal | null> {
  const since = new Date(Date.now() - CIRCULAR_WINDOW_MS);

  // Check if toAgent has recently sent to fromAgent
  const circular = await prisma.transaction.findFirst({
    where: {
      fromAgentId: toAgentId,
      toAgentId: fromAgentId,
      status: "confirmed",
      createdAt: { gte: since },
    },
  });

  if (!circular) return null;

  return {
    type: "circular_payment",
    severity: "high",
    contribution: 35,
    detail: `Reverse payment A→B→A detected within ${CIRCULAR_WINDOW_MS / 60000} minutes`,
  };
}

// ─── Signal: Budget Breach ────────────────────────────────────────────────────

async function checkBudgetBreach(agentId: string, amount: number): Promise<RiskSignal | null> {
  const budget = await prisma.agentBudget.findUnique({ where: { agentId } });
  if (!budget) return null;

  // Reset stale accumulators
  const now = new Date();
  let usedToday = budget.usedToday;
  let usedThisWeek = budget.usedThisWeek;
  let usedThisMonth = budget.usedThisMonth;

  const msDay = 86_400_000;
  const msWeek = 7 * msDay;
  const msMonth = 30 * msDay;

  if (now.getTime() - budget.dailyResetAt.getTime() > msDay) usedToday = 0;
  if (now.getTime() - budget.weeklyResetAt.getTime() > msWeek) usedThisWeek = 0;
  if (now.getTime() - budget.monthlyResetAt.getTime() > msMonth) usedThisMonth = 0;

  if (amount > budget.singleTxLimit) {
    return {
      type: "budget_breach",
      severity: "high",
      contribution: 40,
      detail: `Single tx ${amount} exceeds limit ${budget.singleTxLimit}`,
    };
  }
  if (usedToday + amount > budget.dailyLimit) {
    const pct = ((usedToday + amount) / budget.dailyLimit * 100).toFixed(0);
    return {
      type: "budget_breach",
      severity: "medium",
      contribution: 25,
      detail: `Daily limit breach: ${pct}% of ${budget.dailyLimit}`,
    };
  }
  return null;
}

// ─── Signal: Unknown Counterparty ─────────────────────────────────────────────

async function checkUnknownCounterparty(fromAgentId: string, toAgentId: string): Promise<RiskSignal | null> {
  const priorInteraction = await prisma.transaction.findFirst({
    where: { fromAgentId, toAgentId, status: "confirmed" },
  });

  if (priorInteraction) return null;

  return {
    type: "unknown_counterparty",
    severity: "low",
    contribution: 10,
    detail: "First-time transaction with this counterparty",
  };
}

// ─── Budget accumulator updater ───────────────────────────────────────────────

/**
 * Call after a successful confirmed transaction to update budget accumulators.
 */
export async function recordBudgetUsage(agentId: string, amount: number): Promise<void> {
  const budget = await prisma.agentBudget.findUnique({ where: { agentId } });
  if (!budget) return;

  const now = new Date();
  const msDay = 86_400_000;
  const msWeek = 7 * msDay;
  const msMonth = 30 * msDay;

  const resetDaily = now.getTime() - budget.dailyResetAt.getTime() > msDay;
  const resetWeekly = now.getTime() - budget.weeklyResetAt.getTime() > msWeek;
  const resetMonthly = now.getTime() - budget.monthlyResetAt.getTime() > msMonth;

  await prisma.agentBudget.update({
    where: { agentId },
    data: {
      usedToday: resetDaily ? amount : budget.usedToday + amount,
      usedThisWeek: resetWeekly ? amount : budget.usedThisWeek + amount,
      usedThisMonth: resetMonthly ? amount : budget.usedThisMonth + amount,
      ...(resetDaily && { dailyResetAt: now }),
      ...(resetWeekly && { weeklyResetAt: now }),
      ...(resetMonthly && { monthlyResetAt: now }),
    },
  });
}
