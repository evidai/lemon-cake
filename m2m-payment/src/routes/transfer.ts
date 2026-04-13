import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { getHaltState } from "./killswitch";
import { assessRisk, recordBudgetUsage } from "../lib/fraud";
import { updateReputation, recordIncoming } from "../lib/reputation";
import { checkCompliance } from "../lib/compliance";
import { canTransact, recordSuccess, recordFailure } from "../lib/circuit-breaker";
import { checkRateLimit } from "../lib/rate-limiter";

const router = Router();

/**
 * POST /api/transfer
 * Body: { fromAgentId, toAgentId, amount?, currency? }
 *
 * Transfers SOL (default) or requests JPYC transfer.
 * Pipeline:
 *   1. Killswitch guard
 *   2. Compliance tier check
 *   3. Real-time risk assessment
 *   4. On-chain transfer (with 1 retry)
 *   5. Budget accumulator update
 *   6. Reputation update for both agents
 *   7. Audit log
 */
router.post("/", async (req: Request, res: Response) => {
  // 1. Killswitch
  if (getHaltState()) {
    res.status(403).json({ error: "System is halted. Transfers are disabled." });
    return;
  }

  const {
    fromAgentId,
    toAgentId,
    amount = 1.0,
    currency = "USDC",
  } = req.body as {
    fromAgentId?: string;
    toAgentId?: string;
    amount?: number;
    currency?: string;
  };

  if (!fromAgentId || !toAgentId) {
    res.status(400).json({ error: "fromAgentId and toAgentId are required" });
    return;
  }
  if (fromAgentId === toAgentId) {
    res.status(400).json({ error: "fromAgentId and toAgentId must differ" });
    return;
  }

  const [fromAgent, toAgent] = await Promise.all([
    prisma.agent.findUnique({ where: { id: fromAgentId } }),
    prisma.agent.findUnique({ where: { id: toAgentId } }),
  ]);

  if (!fromAgent) { res.status(404).json({ error: `Agent not found: ${fromAgentId}` }); return; }
  if (!toAgent)   { res.status(404).json({ error: `Agent not found: ${toAgentId}` });   return; }

  // Lazy bootstrap: ensure reputation + budget rows exist for pre-existing agents
  const [repExists, budgetExists] = await Promise.all([
    prisma.agentReputation.findUnique({ where: { agentId: fromAgentId }, select: { agentId: true } }),
    prisma.agentBudget.findUnique({ where: { agentId: fromAgentId }, select: { agentId: true } }),
  ]);
  if (!repExists || !budgetExists) {
    const { bootstrapAgent } = await import("../lib/reputation");
    await bootstrapAgent(fromAgentId);
  }

  // 1b. Budget suspension check (agent may be suspended by fraud engine)
  const budget = await prisma.agentBudget.findUnique({ where: { agentId: fromAgentId } });
  if (budget?.suspended) {
    res.status(403).json({
      error: "Agent is suspended",
      reason: budget.suspendReason ?? "Suspended by fraud detection",
      code: "AGENT_SUSPENDED",
    });
    return;
  }

  // 1c. Circuit-breaker check
  const circuit = canTransact(fromAgentId, toAgentId);
  if (!circuit.allowed) {
    res.status(429).json({ error: "Circuit breaker open", reason: circuit.reason, code: "CIRCUIT_OPEN" });
    return;
  }

  // 1d. Per-tier rate limit
  const tier = (fromAgent.complianceTier as "none" | "kya" | "kyc") ?? "none";
  const rl = checkRateLimit(fromAgentId, tier, amount);
  if (!rl.allowed) {
    res.status(429).json({ error: "Rate limit exceeded", reason: rl.reason, code: "RATE_LIMITED" });
    return;
  }

  // 2. Compliance check
  const compliance = await checkCompliance(fromAgentId, amount, currency as "USDC" | "JPYC");
  if (!compliance.allowed) {
    await prisma.auditLog.create({
      data: {
        agentId: fromAgentId,
        action: "transfer_blocked_compliance",
        detail: JSON.stringify({ toAgentId, amount, currency, reason: compliance.reason }),
        ipAddress: req.ip,
      },
    });
    res.status(403).json({
      error: "Compliance check failed",
      reason: compliance.reason,
      requiredTier: compliance.requiredTier,
    });
    return;
  }

  // 3. Risk assessment
  const risk = await assessRisk(fromAgentId, toAgentId, amount, currency);
  if (risk.shouldBlock) {
    const blocked = await prisma.transaction.create({
      data: {
        fromAgentId,
        toAgentId,
        amount,
        currency,
        status: "blocked",
        riskScore: risk.score,
        flagged: true,
        flagReason: risk.flagReason,
      },
    });
    await prisma.auditLog.create({
      data: {
        agentId: fromAgentId,
        action: "transfer_blocked_fraud",
        detail: JSON.stringify({ toAgentId, amount, currency, riskScore: risk.score, reason: risk.flagReason }),
        ipAddress: req.ip,
      },
    });
    res.status(403).json({
      error: "Transfer blocked by fraud detection",
      riskScore: risk.score,
      reason: risk.flagReason,
      id: blocked.id,
    });
    return;
  }

  // 4. Create pending record
  const txRecord = await prisma.transaction.create({
    data: {
      fromAgentId,
      toAgentId,
      amount,
      currency,
      status: "pending",
      riskScore: risk.score,
      flagged: risk.shouldFlag,
      flagReason: risk.shouldFlag ? risk.flagReason : null,
    },
  });

  // 5. Execute transfer
  //    USDC: settled off-chain via Skyfire payment rail (simulated here)
  //    JPYC: route to /api/jpyc/transfer endpoint
  let txHash: string | null = null;
  let lastError: unknown = null;

  if (currency === "JPYC") {
    res.status(400).json({ error: "Use POST /api/jpyc/transfer for JPYC transfers" });
    return;
  }

  // USDC settlement simulation (replace with Skyfire payment-rail SDK call in production)
  try {
    console.log(`[transfer] USDC settlement — txRecord ${txRecord.id}, amount ${amount}`);
    txHash = `skyfire_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  } catch (err) {
    lastError = err;
  }

  if (txHash) {
    const updated = await prisma.transaction.update({
      where: { id: txRecord.id },
      data: { txHash, status: "confirmed" },
    });

    recordSuccess(fromAgentId, toAgentId);

    // Post-confirmation: budget + reputation
    await Promise.all([
      recordBudgetUsage(fromAgentId, amount),
      updateReputation(fromAgentId, risk.score),
      recordIncoming(toAgentId),
      prisma.auditLog.create({
        data: {
          agentId: fromAgentId,
          action: "transfer_confirmed",
          detail: JSON.stringify({ toAgentId, amount, currency, txHash, riskScore: risk.score }),
          ipAddress: req.ip,
        },
      }),
    ]);

    res.status(200).json({
      id: updated.id,
      fromAgentId: updated.fromAgentId,
      toAgentId: updated.toAgentId,
      amount: updated.amount,
      currency: updated.currency,
      txHash: updated.txHash,
      status: updated.status,
      riskScore: updated.riskScore,
      flagged: updated.flagged,
      createdAt: updated.createdAt,
    });
  } else {
    await prisma.transaction.update({
      where: { id: txRecord.id },
      data: { status: "failed" },
    });
    recordFailure(fromAgentId, toAgentId);
    await updateReputation(fromAgentId, 30); // failed tx increases risk weight
    console.error("[transfer] transfer failed:", lastError);
    res.status(502).json({
      error: "Transfer failed after retry",
      id: txRecord.id,
      status: "failed",
      detail: String(lastError),
    });
  }
});

export default router;
