/**
 * Fraud & Risk Management Routes (admin)
 *
 * GET  /api/fraud/flags           — list open fraud flags
 * POST /api/fraud/flags/:id/resolve — resolve a flag
 * GET  /api/fraud/risk/:agentId   — get risk events for an agent
 * POST /api/fraud/suspend/:agentId  — manually suspend an agent
 * POST /api/fraud/unsuspend/:agentId — unsuspend an agent
 */

import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { suspendAgent, unsuspendAgent } from "../lib/compliance";

const router = Router();

/** GET /api/fraud/flags */
router.get("/flags", async (_req: Request, res: Response) => {
  try {
    const flags = await prisma.fraudFlag.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { agent: { select: { publicKey: true, complianceTier: true } } },
    });
    res.json({ count: flags.length, flags });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch flags", detail: String(err) });
  }
});

/** POST /api/fraud/flags/:id/resolve */
router.post("/flags/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { resolvedBy = "admin" } = req.body as { resolvedBy?: string };
    const flag = await prisma.fraudFlag.update({
      where: { id: req.params.id },
      data: { resolved: true, resolvedBy, resolvedAt: new Date() },
    });
    res.json(flag);
  } catch (err) {
    res.status(500).json({ error: "Failed to resolve flag", detail: String(err) });
  }
});

/** GET /api/fraud/risk/:agentId */
router.get("/risk/:agentId", async (req: Request, res: Response) => {
  try {
    const events = await prisma.riskEvent.findMany({
      where: { agentId: req.params.agentId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ agentId: req.params.agentId, count: events.length, events });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch risk events", detail: String(err) });
  }
});

/** POST /api/fraud/suspend/:agentId */
router.post("/suspend/:agentId", async (req: Request, res: Response) => {
  try {
    const { reason = "Manual suspension by admin" } = req.body as { reason?: string };
    await suspendAgent(req.params.agentId, reason);
    res.json({ agentId: req.params.agentId, suspended: true, reason });
  } catch (err) {
    res.status(500).json({ error: "Failed to suspend agent", detail: String(err) });
  }
});

/** POST /api/fraud/unsuspend/:agentId */
router.post("/unsuspend/:agentId", async (req: Request, res: Response) => {
  try {
    await unsuspendAgent(req.params.agentId);
    res.json({ agentId: req.params.agentId, suspended: false });
  } catch (err) {
    res.status(500).json({ error: "Failed to unsuspend agent", detail: String(err) });
  }
});

export default router;
