import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { generateKeypair } from "../lib/solana";
import { bootstrapAgent, getReputation } from "../lib/reputation";
import { issueKYAToken } from "../lib/kyapay";
import { upgradeTier } from "../lib/compliance";

const router = Router();

/**
 * GET /api/agents
 * List all agents with reputation and budget summary (newest first).
 * Query params: limit (default 50), offset (default 0)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "50", 10), 200);
    const offset = parseInt((req.query.offset as string) ?? "0",  10);

    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        orderBy: { createdAt: "desc" },
        skip:  offset,
        take:  limit,
        include: {
          budget:     true,
          reputation: true,
        },
      }),
      prisma.agent.count(),
    ]);

    res.json({
      total,
      limit,
      offset,
      agents: agents.map((a) => ({
        id:             a.id,
        publicKey:      a.publicKey,
        complianceTier: a.complianceTier,
        ethAddress:     a.ethAddress,
        createdAt:      a.createdAt,
        suspended:      a.budget?.suspended ?? false,
        suspendReason:  a.budget?.suspendReason ?? null,
        dailyLimit:     a.budget?.dailyLimit ?? null,
        usedToday:      a.budget?.usedToday  ?? null,
        trustScore:     a.reputation?.trustScore    ?? null,
        successRate:    a.reputation?.successRate   ?? null,
        totalVolume:    a.reputation
          ? a.reputation.totalSent + a.reputation.totalReceived
          : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/agents]", err);
    res.status(500).json({ error: "Failed to list agents" });
  }
});

/**
 * POST /api/agents
 * Create a new agent with reputation and budget records.
 */
router.post("/", async (_req: Request, res: Response) => {
  try {
    const { publicKey, secretKey } = generateKeypair();

    const agent = await prisma.agent.create({
      data: { publicKey, secretKey },
    });

    // Bootstrap reputation + budget
    await bootstrapAgent(agent.id);

    res.status(201).json({
      id: agent.id,
      publicKey: agent.publicKey,
      complianceTier: agent.complianceTier,
      createdAt: agent.createdAt,
      // Never expose secretKey in production — test-only
      secretKey: agent.secretKey,
    });
  } catch (err) {
    console.error("[POST /api/agents]", err);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

/**
 * GET /api/agents/:id
 * Get agent details including reputation and budget.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [agent, reputation] = await Promise.all([
      prisma.agent.findUnique({
        where: { id },
        include: { budget: true },
      }),
      getReputation(id),
    ]);

    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    res.json({
      id: agent.id,
      publicKey: agent.publicKey,
      complianceTier: agent.complianceTier,
      ethAddress: agent.ethAddress,
      createdAt: agent.createdAt,
      budget: agent.budget
        ? {
            dailyLimit: agent.budget.dailyLimit,
            usedToday: agent.budget.usedToday,
            singleTxLimit: agent.budget.singleTxLimit,
            suspended: agent.budget.suspended,
            suspendReason: agent.budget.suspendReason,
          }
        : null,
      reputation,
    });
  } catch (err) {
    console.error("[GET /api/agents/:id]", err);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

/**
 * POST /api/agents/:id/kya
 * Issue a KYA token and upgrade tier to "kya".
 * Body: { ethAddress? }
 *
 * In production: this endpoint would redirect to Skyfire's identity service.
 */
router.post("/:id/kya", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ethAddress } = req.body as { ethAddress?: string };

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const token = issueKYAToken(agent.publicKey, "kya", { currency: "SOL" });
    await upgradeTier(id, "kya", token);

    if (ethAddress) {
      await prisma.agent.update({ where: { id }, data: { ethAddress } });
    }

    res.json({
      id,
      tier: "kya",
      kyaToken: token,
      message: "KYA token issued. Agent upgraded to 'kya' tier.",
    });
  } catch (err) {
    console.error("[POST /api/agents/:id/kya]", err);
    res.status(500).json({ error: "Failed to issue KYA token" });
  }
});

/**
 * POST /api/agents/:id/kyc
 * Upgrade an agent to full KYC tier.
 * Body: { orgName, verifiedBy }
 *
 * In production: requires org verification documents and manual review.
 */
router.post("/:id/kyc", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orgName, verifiedBy } = req.body as { orgName?: string; verifiedBy?: string };

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const token = issueKYAToken(agent.publicKey, "kyc", {
      org: orgName,
      payLimit: Infinity,
    });
    await upgradeTier(id, "kyc", token);

    await prisma.auditLog.create({
      data: {
        agentId: id,
        action: "kyc_completed",
        detail: JSON.stringify({ orgName, verifiedBy, at: new Date().toISOString() }),
      },
    });

    res.json({
      id,
      tier: "kyc",
      kyaToken: token,
      message: "Agent upgraded to 'kyc' tier. Full transaction limits unlocked.",
    });
  } catch (err) {
    console.error("[POST /api/agents/:id/kyc]", err);
    res.status(500).json({ error: "Failed to complete KYC" });
  }
});

export default router;
