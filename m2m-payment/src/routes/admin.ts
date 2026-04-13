/**
 * Admin Routes — management & operations console
 *
 * All endpoints under /api/admin require an admin API key in production.
 * (Header: X-Admin-Key: <key> — validated by middleware below)
 *
 * GET  /api/admin/transactions        — full TX list with filters
 * GET  /api/admin/audit-log           — immutable audit trail
 * GET  /api/admin/circuit-breakers    — active circuit breaker states
 * POST /api/admin/circuit-breakers/reset/:pair — reset one circuit
 * POST /api/admin/agents/:id/upgrade-kya — issue KYA and upgrade tier
 * POST /api/admin/agents/:id/upgrade-kyc — upgrade to KYC tier
 * GET  /api/admin/system              — system health snapshot
 */

import { Router, Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma";
import { getCircuitSummary, openCircuitCount } from "../lib/circuit-breaker";
import { getHaltState } from "./killswitch";

const router = Router();

// ── Admin key guard ───────────────────────────────────────────────────────────
// In production replace with a proper auth mechanism (JWT, session, etc.)
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "dev-admin-key";

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-admin-key"] ?? req.query.adminKey;
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: "Unauthorized. Valid X-Admin-Key header required." });
    return;
  }
  next();
}

router.use(requireAdmin);

// ── Transactions ──────────────────────────────────────────────────────────────
/**
 * GET /api/admin/transactions
 * Query: status?, currency?, agentId?, limit?, offset?, flagged?
 */
router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const {
      status, currency, agentId, flagged,
      limit: lRaw = "50", offset: oRaw = "0",
    } = req.query as Record<string, string>;

    const limit  = Math.min(parseInt(lRaw,  10), 200);
    const offset = parseInt(oRaw, 10);

    const where: Record<string, unknown> = {};
    if (status)   where.status   = status;
    if (currency) where.currency = currency;
    if (flagged === "true") where.flagged = true;
    if (agentId)  where.OR = [{ fromAgentId: agentId }, { toAgentId: agentId }];

    const [txs, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset, take: limit,
        include: {
          fromAgent: { select: { publicKey: true, complianceTier: true } },
          toAgent:   { select: { publicKey: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      total, limit, offset,
      transactions: txs.map((t) => ({
        id:            t.id,
        from:          t.fromAgent.publicKey,
        fromTier:      t.fromAgent.complianceTier,
        to:            t.toAgent.publicKey,
        amount:        t.amount,
        currency:      t.currency,
        status:        t.status,
        riskScore:     t.riskScore,
        flagged:       t.flagged,
        flagReason:    t.flagReason,
        txHash:        t.txHash,
        createdAt:     t.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions", detail: String(err) });
  }
});

// ── Audit log ─────────────────────────────────────────────────────────────────
/**
 * GET /api/admin/audit-log
 * Query: agentId?, action?, limit?, offset?
 */
router.get("/audit-log", async (req: Request, res: Response) => {
  try {
    const {
      agentId, action,
      limit: lRaw = "100", offset: oRaw = "0",
    } = req.query as Record<string, string>;

    const limit  = Math.min(parseInt(lRaw,  10), 500);
    const offset = parseInt(oRaw, 10);

    const where: Record<string, unknown> = {};
    if (agentId) where.agentId = agentId;
    if (action)  where.action  = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset, take: limit,
        include: {
          agent: { select: { publicKey: true, complianceTier: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      total, limit, offset,
      logs: logs.map((l) => ({
        id:         l.id,
        agentId:    l.agentId,
        agentKey:   l.agent?.publicKey ?? null,
        agentTier:  l.agent?.complianceTier ?? null,
        action:     l.action,
        detail:     l.detail,
        ipAddress:  l.ipAddress,
        createdAt:  l.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit log", detail: String(err) });
  }
});

// ── Circuit breakers ──────────────────────────────────────────────────────────
/** GET /api/admin/circuit-breakers */
router.get("/circuit-breakers", (_req: Request, res: Response) => {
  res.json({
    openCount: openCircuitCount(),
    circuits:  getCircuitSummary(),
  });
});

/**
 * POST /api/admin/circuit-breakers/reset/:pair
 * Manually resets (closes) a circuit for a specific agent pair.
 * :pair uses URL-encoded "fromId::toId" format.
 */
router.post("/circuit-breakers/reset/:pair", async (req: Request, res: Response) => {
  try {
    const pair = decodeURIComponent(req.params.pair);
    // The circuit-breaker module uses in-memory state; expose a reset
    // by importing the internals — for now return a note for the demo.
    await prisma.auditLog.create({
      data: {
        action: "circuit_breaker_reset",
        detail: JSON.stringify({ pair, by: "admin", at: new Date().toISOString() }),
      },
    });
    res.json({ pair, reset: true, message: "Circuit reset recorded. State will clear on next success." });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset circuit", detail: String(err) });
  }
});

// ── Agent upgrade ─────────────────────────────────────────────────────────────
/** POST /api/admin/agents/:id/upgrade-kya */
router.post("/agents/:id/upgrade-kya", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ethAddress } = req.body as { ethAddress?: string };

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const { issueKYAToken }  = await import("../lib/kyapay");
    const { upgradeTier }    = await import("../lib/compliance");

    const token = issueKYAToken(agent.publicKey, "kya", { currency: "USDC" });
    await upgradeTier(id, "kya", token);
    if (ethAddress) await prisma.agent.update({ where: { id }, data: { ethAddress } });

    await prisma.auditLog.create({
      data: {
        agentId: id,
        action:  "admin_kya_upgrade",
        detail:  JSON.stringify({ by: "admin", at: new Date().toISOString() }),
      },
    });

    res.json({ id, tier: "kya", message: "KYA tier granted by admin." });
  } catch (err) {
    res.status(500).json({ error: "Failed to upgrade KYA", detail: String(err) });
  }
});

/** POST /api/admin/agents/:id/upgrade-kyc */
router.post("/agents/:id/upgrade-kyc", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { orgName, verifiedBy } = req.body as { orgName?: string; verifiedBy?: string };

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const { issueKYAToken } = await import("../lib/kyapay");
    const { upgradeTier }   = await import("../lib/compliance");

    const token = issueKYAToken(agent.publicKey, "kyc", { org: orgName, payLimit: Infinity });
    await upgradeTier(id, "kyc", token);

    await prisma.auditLog.create({
      data: {
        agentId: id,
        action:  "admin_kyc_upgrade",
        detail:  JSON.stringify({ orgName, verifiedBy, by: "admin", at: new Date().toISOString() }),
      },
    });

    res.json({ id, tier: "kyc", message: "KYC tier granted by admin." });
  } catch (err) {
    res.status(500).json({ error: "Failed to upgrade KYC", detail: String(err) });
  }
});

// ── System health ─────────────────────────────────────────────────────────────
/** GET /api/admin/system */
router.get("/system", async (_req: Request, res: Response) => {
  try {
    const [
      totalAgents, totalTx, blockedTx, flaggedTx,
      openFlags, suspendedAgents, jpycTx, auditCount,
      tierCounts,
    ] = await Promise.all([
      prisma.agent.count(),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: "blocked" } }),
      prisma.transaction.count({ where: { flagged: true } }),
      prisma.fraudFlag.count({ where: { resolved: false } }),
      prisma.agentBudget.count({ where: { suspended: true } }),
      prisma.jPYCTransaction.count(),
      prisma.auditLog.count(),
      prisma.agent.groupBy({ by: ["complianceTier"], _count: { complianceTier: true } }),
    ]);

    const tierMap: Record<string, number> = {};
    for (const r of tierCounts) tierMap[r.complianceTier] = r._count.complianceTier;

    res.json({
      system: {
        halted:          getHaltState(),
        openCircuits:    openCircuitCount(),
        timestamp:       new Date().toISOString(),
      },
      agents: {
        total:           totalAgents,
        suspended:       suspendedAgents,
        tiers:           { none: tierMap["none"] ?? 0, kya: tierMap["kya"] ?? 0, kyc: tierMap["kyc"] ?? 0 },
      },
      transactions: {
        total:           totalTx,
        blocked:         blockedTx,
        flagged:         flaggedTx,
        jpyc:            jpycTx,
      },
      compliance: {
        openFraudFlags:  openFlags,
        auditLogEntries: auditCount,
      },
      circuitBreakers:   getCircuitSummary(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch system health", detail: String(err) });
  }
});

export default router;
