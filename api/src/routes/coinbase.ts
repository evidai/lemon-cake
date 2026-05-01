/**
 * Coinbase Commerce ルート
 *
 * POST /api/coinbase/checkout — hosted checkout URL を発行
 * POST /api/coinbase/webhook  — charge:confirmed/resolved を受信して残高加算
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";
import { createCoinbaseCharge, handleCoinbaseWebhook } from "../lib/coinbase-commerce.js";

export const coinbaseRouter = new Hono();

coinbaseRouter.post(
  "/checkout",
  requireBuyerAuth,
  zValidator("json", z.object({
    amountUsd:  z.number().positive().max(10000),
    successUrl: z.string().url(),
    cancelUrl:  z.string().url(),
  })),
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId");
    const { amountUsd, successUrl, cancelUrl } = c.req.valid("json");
    try {
      const result = await createCoinbaseCharge({ buyerId, amountUsd, successUrl, cancelUrl });
      return c.json(result, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[coinbase/checkout]", msg);
      return c.json({ error: msg }, 500);
    }
  },
);

coinbaseRouter.post("/webhook", async (c) => {
  const signature = c.req.header("X-CC-Webhook-Signature");
  const rawBody   = await c.req.text();
  try {
    const result = await handleCoinbaseWebhook(rawBody, signature);
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[coinbase/webhook]", msg);
    return c.json({ error: msg }, 400);
  }
});
