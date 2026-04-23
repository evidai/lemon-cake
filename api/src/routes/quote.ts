/**
 * POST /api/quote — Dry-run authorize/quote
 *
 * Returns what WOULD be charged for a given Pay Token + amount WITHOUT
 * touching the DB or the buyer's balance. Use cases:
 *   - CI / staging policy tests
 *   - Agent-side pre-flight before actually calling upstream
 *   - Client-side "what if" UI
 *
 * All checks the real POST /api/charge performs are run here, and the
 * response mirrors why a real charge would succeed or fail — but NO state
 * is written.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyPayToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";
import { Decimal } from "@prisma/client/runtime/library";

export const quoteRouter = new OpenAPIHono();

// ─── Simple in-memory rate limiter (60 req/min per buyer) ──────────────
// Since /api/quote is side-effect-free, a more sophisticated limiter isn't
// needed — this just prevents runaway scripts.
const quoteRate = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

function rateCheck(buyerId: string): void {
  const now = Date.now();
  const entry = quoteRate.get(buyerId);
  if (!entry || now >= entry.resetAt) {
    quoteRate.set(buyerId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (entry.count >= MAX_PER_WINDOW) {
    throw new HTTPException(429, { message: "Quote rate limit exceeded (60/min)" });
  }
  entry.count += 1;
}

// ─── Schemas ───────────────────────────────────────────────────────────

const QuoteBody = z.object({
  payToken:   z.string().min(10),
  amountUsdc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "up to 6 decimal places")
    .refine((v) => parseFloat(v) > 0, "must be > 0"),
  upstream:   z.string().max(256).optional(),
});

const QuoteResponse = z.object({
  allowed:           z.boolean(),
  reasonCode:        z.enum([
    "OK",
    "TOKEN_INVALID",
    "TOKEN_REVOKED",
    "TOKEN_EXPIRED",
    "LIMIT_EXCEEDED",
    "INSUFFICIENT_BALANCE",
    "UPSTREAM_NOT_ALLOWED",
    "BUYER_SUSPENDED",
  ]),
  reason:            z.string().nullable(),
  projectedUsed:     z.string(),
  projectedRemaining:z.string(),
  projectedBalance:  z.string(),
  sandbox:           z.boolean(),
  dryRun:            z.literal(true),
});

const route = createRoute({
  method:  "post",
  path:    "/",
  tags:    ["Quote"],
  summary: "Dry-run a charge without side effects",
  description: [
    "Evaluates whether the same call to POST /api/charges would succeed,",
    "and returns the projected post-call state. Zero DB writes, zero",
    "balance movement. Rate-limited at 60 requests per minute per buyer.",
  ].join("\n"),
  request: {
    body: { content: { "application/json": { schema: QuoteBody } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: QuoteResponse } },
      description: "Quote evaluated (allowed or denied)",
    },
    401: { description: "Invalid Pay Token" },
    429: { description: "Rate limit exceeded" },
  },
});

quoteRouter.openapi(route, async (c) => {
  const body = c.req.valid("json");

  // ── Verify Pay Token signature ──────────────────────────────────────
  let payload: Awaited<ReturnType<typeof verifyPayToken>>;
  try {
    payload = await verifyPayToken(body.payToken);
  } catch {
    return c.json(
      {
        allowed: false,
        reasonCode: "TOKEN_INVALID" as const,
        reason: "Signature verification failed",
        projectedUsed: "0",
        projectedRemaining: "0",
        projectedBalance: "0",
        sandbox: false,
        dryRun: true as const,
      } satisfies z.infer<typeof QuoteResponse>,
      200,
    );
  }

  const { jti: tokenId, sub: buyerId } = payload;
  rateCheck(buyerId);

  // ── Load token + buyer ─────────────────────────────────────────────
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) {
    return c.json(
      {
        allowed: false,
        reasonCode: "TOKEN_INVALID" as const,
        reason: "Token record not found",
        projectedUsed: "0",
        projectedRemaining: "0",
        projectedBalance: "0",
        sandbox: false,
        dryRun: true as const,
      } satisfies z.infer<typeof QuoteResponse>,
      200,
    );
  }

  const amountDec = new Decimal(body.amountUsdc);
  const projectedUsed = token.usedUsdc.add(amountDec);
  const projectedRemaining = token.limitUsdc.sub(projectedUsed);

  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  const projectedBalance = buyer
    ? (token.sandbox ? buyer.balanceUsdc : buyer.balanceUsdc.sub(amountDec))
    : new Decimal(0);

  // ── Evaluate ───────────────────────────────────────────────────────
  const make = (reasonCode: z.infer<typeof QuoteResponse>["reasonCode"], reason: string | null) =>
    ({
      allowed: reasonCode === "OK",
      reasonCode,
      reason,
      projectedUsed: projectedUsed.toFixed(6),
      projectedRemaining: projectedRemaining.toFixed(6),
      projectedBalance: projectedBalance.toFixed(6),
      sandbox: token.sandbox,
      dryRun: true as const,
    } satisfies z.infer<typeof QuoteResponse>);

  if (token.revoked)                          return c.json(make("TOKEN_REVOKED", "Token has been revoked"), 200);
  if (token.expiresAt < new Date())           return c.json(make("TOKEN_EXPIRED", "Token has expired"), 200);
  if (projectedUsed.greaterThan(token.limitUsdc)) {
    return c.json(make("LIMIT_EXCEEDED", `Cap ${token.limitUsdc.toFixed(6)} USDC exceeded`), 200);
  }
  if (!buyer)                                 return c.json(make("TOKEN_INVALID", "Buyer not found"), 200);
  if (buyer.suspended)                        return c.json(make("BUYER_SUSPENDED", "Buyer is suspended"), 200);
  if (!token.sandbox && buyer.balanceUsdc.lessThan(amountDec)) {
    return c.json(make("INSUFFICIENT_BALANCE", "Buyer balance too low"), 200);
  }
  if (body.upstream && token.allowedUpstreams.length > 0) {
    // Wildcard-free whitelist match for v0 — exact host match only.
    const allowed = token.allowedUpstreams.some((u) => u === body.upstream);
    if (!allowed) return c.json(make("UPSTREAM_NOT_ALLOWED", `${body.upstream} not in allowed_upstreams`), 200);
  }

  return c.json(make("OK", null), 200);
});
