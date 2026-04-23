/**
 * Spend-threshold Webhooks CRUD (Phase 3)
 *
 * POST   /api/spend-webhooks       — register a webhook
 * GET    /api/spend-webhooks       — list the caller's webhooks
 * DELETE /api/spend-webhooks/:id   — remove a webhook
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyBuyerToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";

export const spendWebhooksRouter = new OpenAPIHono();

// ─── Buyer auth helper ────────────────────────────────────────────────
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

// ─── Schemas ──────────────────────────────────────────────────────────
const CreateBody = z.object({
  url:        z.string().url().refine((u) => u.startsWith("https://"), "webhook URL must be HTTPS"),
  thresholds: z.array(z.number().int().min(1).max(100)).min(1).max(10).optional(),
});

const WebhookItem = z.object({
  id:         z.string(),
  url:        z.string(),
  thresholds: z.array(z.number()),
  active:     z.boolean(),
  createdAt:  z.string(),
  // secret is only returned ONCE at create time
});

// ─── POST /api/spend-webhooks ────────────────────────────────────────
const createRouteDef = createRoute({
  method:  "post",
  path:    "/",
  tags:    ["SpendWebhooks"],
  summary: "Register a spend-threshold webhook",
  request: {
    body: { content: { "application/json": { schema: CreateBody } }, required: true },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: WebhookItem.extend({
            secret: z.string().describe("Returned ONCE — save it; used for HMAC signature verification."),
          }),
        },
      },
      description: "Created",
    },
    401: { description: "Unauthorized" },
  },
});

spendWebhooksRouter.openapi(createRouteDef, async (c) => {
  const buyerId = await getBuyerId(c);
  const body = c.req.valid("json");

  const secret = randomBytes(32).toString("hex");
  const wh = await prisma.spendWebhook.create({
    data: {
      buyerId,
      url:        body.url,
      thresholds: body.thresholds ?? [50, 80, 95],
      secret,
    },
  });

  return c.json(
    {
      id:         wh.id,
      url:        wh.url,
      thresholds: wh.thresholds,
      active:     wh.active,
      createdAt:  wh.createdAt.toISOString(),
      secret,
    },
    201,
  );
});

// ─── GET /api/spend-webhooks ─────────────────────────────────────────
const listRouteDef = createRoute({
  method:  "get",
  path:    "/",
  tags:    ["SpendWebhooks"],
  summary: "List the caller's webhooks",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(WebhookItem) }) } },
      description: "OK",
    },
    401: { description: "Unauthorized" },
  },
});

spendWebhooksRouter.openapi(listRouteDef, async (c) => {
  const buyerId = await getBuyerId(c);
  const items = await prisma.spendWebhook.findMany({ where: { buyerId }, orderBy: { createdAt: "desc" } });
  return c.json({
    data: items.map((w) => ({
      id:         w.id,
      url:        w.url,
      thresholds: w.thresholds,
      active:     w.active,
      createdAt:  w.createdAt.toISOString(),
    })),
  });
});

// ─── DELETE /api/spend-webhooks/:id ──────────────────────────────────
const delRouteDef = createRoute({
  method:  "delete",
  path:    "/{id}",
  tags:    ["SpendWebhooks"],
  summary: "Remove a webhook",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: "Deleted", content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } } },
    401: { description: "Unauthorized" },
    404: { description: "Not found" },
  },
});

spendWebhooksRouter.openapi(delRouteDef, async (c) => {
  const buyerId = await getBuyerId(c);
  const { id } = c.req.valid("param");
  const existing = await prisma.spendWebhook.findFirst({ where: { id, buyerId } });
  if (!existing) throw new HTTPException(404, { message: "Webhook not found" });
  await prisma.spendWebhook.delete({ where: { id } });
  return c.json({ ok: true as const });
});
