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
} from "../lib/stripe-bank.js";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";

export const stripeRouter = new Hono();

// ─── POST /api/stripe/bank-transfer ─────────────────────────
// バーチャル口座の発行（Buyer認証必須）
stripeRouter.post(
  "/bank-transfer",
  requireBuyerAuth,
  zValidator("json", z.object({
    email: z.string().email(),
    name:  z.string().min(1),
  })),
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId") as string;
    const { email, name } = c.req.valid("json");

    const result = await createBankTransferAccount(buyerId, email, name);
    return c.json({
      message:             "バーチャル口座を発行しました",
      customerId:          result.customerId,
      virtualAccount:      result.virtualAccountNumber
        ? {
            accountNumber: result.virtualAccountNumber,
            bankName:      result.bankName,
            branchCode:    result.branchCode,
          }
        : null,
    }, 201);
  },
);

// ─── POST /api/stripe/card-checkout ──────────────────────────
stripeRouter.post(
  "/card-checkout",
  requireBuyerAuth,
  zValidator("json", z.object({
    amountJpy:  z.number().int().min(500),
    successUrl: z.string().url(),
    cancelUrl:  z.string().url(),
  })),
  async (c) => {
    const buyerId = (c as never as { get: (k: string) => string }).get("buyerId") as string;
    const { amountJpy, successUrl, cancelUrl } = c.req.valid("json");
    const result = await createCardCheckoutSession(buyerId, amountJpy, successUrl, cancelUrl);
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
    const buyerCtx = (c as never as { get: (k: string) => { stripeCustomerId?: string } }).get("buyer") as { stripeCustomerId?: string };
    if (!buyerCtx?.stripeCustomerId) {
      return c.json({ error: "バーチャル口座が未発行です" }, 404);
    }
    const balance = await getStripeCustomerBalance(buyerCtx.stripeCustomerId);
    return c.json(balance);
  },
);
