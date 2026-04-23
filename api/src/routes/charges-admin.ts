/**
 * Phase 5 — Charge reconciliation & export
 *
 *   PATCH /api/charges/:id/annotate — merge annotations + owner + status
 *   POST  /api/charges/:id/close    — mark reconcileStatus=CLOSED, closedAt=now
 *   GET   /api/charges/export       — stream JSONL or CSV of charges + contract
 *
 * All endpoints are buyer-scoped: callers can only touch their own charges.
 * Annotate is idempotent — the body is deep-merged into the existing
 * `annotations` JSONB column, so repeated calls with the same keys converge.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyBuyerToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";

export const chargesAdminRouter = new OpenAPIHono();

async function getBuyerId(c: import("hono").Context): Promise<string> {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) throw new HTTPException(401, { message: "Unauthorized" });
  try {
    const p = await verifyBuyerToken(auth.slice(7));
    return p.buyerId;
  } catch {
    throw new HTTPException(401, { message: "Invalid token" });
  }
}

// ─── PATCH /api/charges/:id/annotate ─────────────────────────────────
const annotateBody = z.object({
  annotations:     z.record(z.unknown()).optional(),
  ownerQueue:      z.string().max(128).optional(),
  ownerReason:     z.string().max(500).optional(),
  reconcileStatus: z.enum(["OPEN", "ANNOTATED", "CLOSED", "DISPUTED"]).optional(),
  escalate:        z.boolean().optional(),
});

const annotateRoute = createRoute({
  method:  "patch",
  path:    "/{id}/annotate",
  tags:    ["Charges"],
  summary: "Charge にオーナー / ノート / ステータスを付与する",
  request: {
    params: z.object({ id: z.string() }),
    body:   { content: { "application/json": { schema: annotateBody } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id:              z.string(),
            reconcileStatus: z.string(),
            ownerQueue:      z.string().nullable(),
            escalatedAt:     z.string().nullable(),
          }),
        },
      },
      description: "OK",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

chargesAdminRouter.openapi(annotateRoute, async (c) => {
  const buyerId = await getBuyerId(c);
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");

  const existing = await prisma.charge.findFirst({ where: { id, buyerId } });
  if (!existing) throw new HTTPException(404, { message: "Charge not found" });

  // Deep-merge existing annotations with new keys (new wins).
  const prev = (existing.annotations ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = body.annotations
    ? { ...prev, ...body.annotations }
    : prev;

  const updated = await prisma.charge.update({
    where: { id },
    data:  {
      annotations: merged as unknown as import("@prisma/client").Prisma.InputJsonValue,
      ...(body.ownerQueue      !== undefined ? { ownerQueue:      body.ownerQueue }      : {}),
      ...(body.ownerReason     !== undefined ? { ownerReason:     body.ownerReason }     : {}),
      ...(body.reconcileStatus !== undefined
        ? { reconcileStatus: body.reconcileStatus }
        : body.annotations && existing.reconcileStatus === "OPEN"
          ? { reconcileStatus: "ANNOTATED" as const }
          : {}),
      ...(body.escalate && !existing.escalatedAt ? { escalatedAt: new Date() } : {}),
    },
  });

  return c.json({
    id:              updated.id,
    reconcileStatus: updated.reconcileStatus,
    ownerQueue:      updated.ownerQueue,
    escalatedAt:     updated.escalatedAt?.toISOString() ?? null,
  });
});

// ─── POST /api/charges/:id/close ─────────────────────────────────────
const closeRoute = createRoute({
  method:  "post",
  path:    "/{id}/close",
  tags:    ["Charges"],
  summary: "Charge の reconcile を CLOSED にする（冪等）",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ id: z.string(), closedAt: z.string(), reconcileStatus: z.string() }),
        },
      },
      description: "OK",
    },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

chargesAdminRouter.openapi(closeRoute, async (c) => {
  const buyerId = await getBuyerId(c);
  const { id } = c.req.valid("param");
  const existing = await prisma.charge.findFirst({ where: { id, buyerId } });
  if (!existing) throw new HTTPException(404, { message: "Charge not found" });

  // Idempotent — if already closed, return existing closedAt.
  const updated = existing.closedAt
    ? existing
    : await prisma.charge.update({
        where: { id },
        data:  { reconcileStatus: "CLOSED", closedAt: new Date() },
      });

  return c.json({
    id:              updated.id,
    closedAt:        (updated.closedAt ?? new Date()).toISOString(),
    reconcileStatus: updated.reconcileStatus,
  });
});

// ─── GET /api/charges/export ─────────────────────────────────────────
const exportRoute = createRoute({
  method:  "get",
  path:    "/export",
  tags:    ["Charges"],
  summary: "Charge + incident contract を JSONL / CSV でエクスポート",
  request: {
    query: z.object({
      format:      z.enum(["jsonl", "csv"]).default("jsonl"),
      from:        z.string().datetime().optional(),
      to:          z.string().datetime().optional(),
      workflowId:  z.string().optional(),
      incidentTag: z.string().optional(),
      status:      z.enum(["PENDING", "COMPLETED", "FAILED"]).optional(),
      limit:       z.coerce.number().int().min(1).max(10000).default(1000),
    }),
  },
  responses: {
    200: { description: "JSONL または CSV ストリーム" },
    401: { description: "Unauthorized" },
  },
});

chargesAdminRouter.openapi(exportRoute, async (c) => {
  const buyerId = await getBuyerId(c);
  const q = c.req.valid("query");

  const where = {
    buyerId,
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
    ...(q.workflowId  ? { workflowId:  q.workflowId }  : {}),
    ...(q.incidentTag ? { incidentTag: q.incidentTag } : {}),
    ...(q.status      ? { status:      q.status }      : {}),
  };

  const rows = await prisma.charge.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    q.limit,
  });

  if (q.format === "csv") {
    // Narrow flat column set suited for spreadsheets; full contract in JSONL.
    const header = [
      "id", "createdAt", "status", "reconcileStatus", "amountUsdc",
      "tokenId", "serviceId", "workflowId", "agentId", "incidentTag",
      "requestId", "inputHash", "responseHash", "providerStatus",
      "txHash", "closedAt",
    ];
    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.id, r.createdAt.toISOString(), r.status, r.reconcileStatus, r.amountUsdc.toFixed(6),
        r.tokenId, r.serviceId, r.workflowId, r.agentId, r.incidentTag,
        r.requestId, r.inputHash, r.responseHash, r.providerStatus,
        r.txHash, r.closedAt?.toISOString() ?? null,
      ].map(esc).join(","));
    }
    return new Response(lines.join("\n") + "\n", {
      status:  200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="charges-${Date.now()}.csv"`,
      },
    });
  }

  // JSONL — one full Charge (with contract) per line.
  const body = rows
    .map((r) => JSON.stringify({
      ...r,
      amountUsdc: r.amountUsdc.toFixed(6),
      createdAt:  r.createdAt.toISOString(),
      updatedAt:  r.updatedAt.toISOString(),
      closedAt:   r.closedAt?.toISOString() ?? null,
      escalatedAt: r.escalatedAt?.toISOString() ?? null,
    }))
    .join("\n");
  return new Response(body + (body ? "\n" : ""), {
    status:  200,
    headers: {
      "Content-Type":        "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="charges-${Date.now()}.jsonl"`,
    },
  });
});
