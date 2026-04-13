/**
 * JPYC Transfer Routes
 *
 * All routes mounted at /api/jpyc:
 *   POST /api/jpyc/transfer         — Execute a JPYC transfer between agents
 *   GET  /api/jpyc/balance/:address — Get JPYC balance for an Ethereum address
 *   GET  /api/jpyc/rate             — Get current JPYC/JPY rate
 */

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { transferJPYC, getJPYCBalance, getJPYCRate } from "../lib/jpyc";
import { assessRisk, recordBudgetUsage } from "../lib/fraud";
import { checkCompliance, isPSAExempt } from "../lib/compliance";
import { updateReputation, recordIncoming } from "../lib/reputation";
import { getHaltState } from "./killswitch";

const router = Router();

/**
 * POST /api/jpyc/transfer
 * Body: { fromAgentId, toAgentId, amountJPYC, chainId? }
 */
router.post("/transfer", async (req: Request, res: Response) => {
  if (getHaltState()) {
    res.status(403).json({ error: "System is halted." });
    return;
  }

  const { fromAgentId, toAgentId, amountJPYC, chainId = 137 } = req.body as {
    fromAgentId?: string;
    toAgentId?: string;
    amountJPYC?: number;
    chainId?: number;
  };

  if (!fromAgentId || !toAgentId || amountJPYC === undefined) {
    res.status(400).json({ error: "fromAgentId, toAgentId, amountJPYC are required" });
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
  if (!fromAgent.ethAddress) {
    res.status(400).json({ error: "Sender agent has no ethAddress. Call POST /api/agents/:id/kya with ethAddress first." });
    return;
  }
  if (!toAgent.ethAddress) {
    res.status(400).json({ error: "Recipient agent has no ethAddress." });
    return;
  }

  // PSA micro-payment exemption check
  const psaExempt = isPSAExempt(amountJPYC, "JPYC");

  // Compliance check
  const compliance = await checkCompliance(fromAgentId, amountJPYC, "JPYC");
  if (!compliance.allowed) {
    res.status(403).json({
      error: "Compliance check failed",
      reason: compliance.reason,
      requiredTier: compliance.requiredTier,
      psaExempt,
    });
    return;
  }

  // Risk assessment
  const risk = await assessRisk(fromAgentId, toAgentId, amountJPYC, "JPYC");
  if (risk.shouldBlock) {
    res.status(403).json({
      error: "Transfer blocked by fraud detection",
      riskScore: risk.score,
      reason: risk.flagReason,
    });
    return;
  }

  // Execute JPYC transfer
  try {
    const result = await transferJPYC({
      fromAddress: fromAgent.ethAddress,
      toAddress: toAgent.ethAddress,
      amountJPYC,
      chainId,
    });

    // Post-confirmation side effects
    await Promise.all([
      recordBudgetUsage(fromAgentId, amountJPYC),
      updateReputation(fromAgentId, risk.score),
      recordIncoming(toAgentId),
      prisma.auditLog.create({
        data: {
          agentId: fromAgentId,
          action: "jpyc_transfer_confirmed",
          detail: JSON.stringify({
            toAgentId,
            amountJPYC,
            amountJPY: result.amountJPY,
            txHash: result.txHash,
            chainId,
            riskScore: risk.score,
            psaExempt,
          }),
          ipAddress: req.ip,
        },
      }),
    ]);

    res.status(200).json({
      ...result,
      fromAgentId,
      toAgentId,
      riskScore: risk.score,
      flagged: risk.shouldFlag,
      psaExempt,
    });
  } catch (err) {
    console.error("[POST /api/transfer/jpyc]", err);
    res.status(502).json({ error: "JPYC transfer failed", detail: String(err) });
  }
});

/**
 * GET /api/jpyc/balance/:address
 */
router.get("/balance/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const chainId = parseInt(req.query.chainId as string) || 137;
    const result = await getJPYCBalance(address, chainId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance", detail: String(err) });
  }
});

/**
 * GET /api/jpyc/rate
 */
router.get("/rate", async (_req: Request, res: Response) => {
  try {
    const rate = await getJPYCRate();
    res.json({ jpycPerJpy: 1 / rate, jpyPerJpyc: rate, source: "oracle", at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rate", detail: String(err) });
  }
});

export default router;
