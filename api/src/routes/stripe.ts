/**
 * Stripe 銀行振込チャージ ルート
 *
 * POST /api/stripe/bank-transfer        — バーチャル口座発行
 * POST /api/stripe/webhook              — Stripe Webhook 受信
 * GET  /api/stripe/balance/:customerId  — カスタマー残高照会
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  createBankTransferAccount,
  createCardCheckoutSession,
  handleStripeWebhook,
  getStripeCustomerBalance,
  type SupportedCurrency,
} from "../lib/stripe-bank.js";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";
import { prisma } from "../lib/prisma.js";

export const stripeRouter = new Hono();

// ─── POST /api/stripe/bank-transfer ─────────────────────────
stripeRouter.post(
  "/bank-transfer",
  requireBuyerAuth,
  zValidator("json", z.object({
    email:    z.string().email(),
    name:     z.string().min(1),
    currency: z.enum(["usd", "jpy", "eur", "gbp"]).default("jpy"),
  })),
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId") as string;
    const { email, name, currency } = c.req.valid("json");

    try {
      const result = await createBankTransferAccount(buyerId, email, name, currency as SupportedCurrency);
      return c.json({
        message:     "バーチャル口座を発行しました",
        customerId:  result.customerId,
        bankDetails: result.bankDetails,
      }, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[stripe/bank-transfer] ERROR:", msg, e);
      return c.json({ error: msg }, 500);
    }
  },
);

// ─── POST /api/stripe/card-checkout ──────────────────────────
stripeRouter.post(
  "/card-checkout",
  requireBuyerAuth,
  zValidator("json", z.object({
    amount:     z.number().positive(),
    currency:   z.enum(["usd", "jpy", "eur", "gbp"]).default("jpy"),
    successUrl: z.string().url(),
    cancelUrl:  z.string().url(),
    // 後方互換: amountJpy があれば currency=jpy として扱う
    amountJpy:  z.number().int().min(1).optional(),
  })),
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId") as string;
    const body    = c.req.valid("json");

    const amount   = body.amountJpy ?? body.amount;
    const currency = (body.amountJpy ? "jpy" : body.currency) as SupportedCurrency;

    const result = await createCardCheckoutSession(buyerId, amount, currency, body.successUrl, body.cancelUrl);
    return c.json(result, 201);
  },
);

// ─── POST /api/stripe/webhook ─────────────────────────────────
// Stripe からのイベント受信（署名検証あり）
stripeRouter.post("/webhook", async (c) => {
  const signature = c.req.header("stripe-signature") ?? "";
  const rawBody   = await c.req.text();

  const result = await handleStripeWebhook(rawBody, signature);
  return c.json(result);
});

// ─── GET /api/stripe/balance ──────────────────────────────────
stripeRouter.get(
  "/balance",
  requireBuyerAuth,
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId") as string;
    const buyer   = await prisma.buyer.findUnique({ where: { id: buyerId } });
    if (!buyer?.stripeCustomerId) {
      return c.json({ error: "バーチャル口座が未発行です" }, 404);
    }
    const balance = await getStripeCustomerBalance(buyer.stripeCustomerId);
    return c.json(balance);
  },
);
