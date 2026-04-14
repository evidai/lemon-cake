/**
 * Stripe 銀行振込チャージ (Customer Balance)
 *
 * AIエージェントオーナーごとにバーチャル口座を発行し、
 * 銀行振込着金をトリガーにエージェント利用可能残高を更新する。
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require("stripe").default ?? require("stripe");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeClient = any;
import { prisma } from "./prisma.js";

function getStripe(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

export interface CreateBankTransferAccountResult {
  customerId:           string;
  virtualAccountNumber?: string;
  bankName?:            string;
  branchCode?:          string;
}

// ─── Stripeカスタマー作成（バーチャル口座付き）────────────────
export async function createBankTransferAccount(
  buyerId: string,
  email:   string,
  name:    string,
): Promise<CreateBankTransferAccountResult> {
  const stripe = getStripe();

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { buyerId },
    preferred_locales: ["ja-JP"],
  });

  let virtualAccountNumber: string | undefined;
  let bankName:   string | undefined;
  let branchCode: string | undefined;

  try {
    // 支払いインテント (JP銀行振込) を作成して口座番号を取得
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   100,
      currency: "jpy",
      customer: customer.id,
      payment_method_types: ["customer_balance"],
      payment_method_data:  { type: "customer_balance" },
      confirm: true,
      payment_method_options: {
        customer_balance: {
          funding_type:  "bank_transfer",
          bank_transfer: { type: "jp_bank_transfer" },
        },
      },
    } as Parameters<typeof stripe.paymentIntents.create>[0]);

    const instructions = (paymentIntent.next_action as Record<string, unknown>)
      ?.display_bank_transfer_instructions as Record<string, unknown> | undefined;

    const addresses = instructions?.financial_addresses as Array<Record<string, unknown>> | undefined;
    const zengin = addresses?.find(fa => fa.type === "zengin")?.zengin as Record<string, string> | undefined;

    virtualAccountNumber = zengin?.account_number;
    bankName             = zengin?.bank_name;
    branchCode           = zengin?.branch_code;
  } catch {
    // バーチャル口座発行失敗はカスタマー作成自体は成功扱い
  }

  await prisma.buyer.update({
    where: { id: buyerId },
    data:  { stripeCustomerId: customer.id } as never,
  });

  return { customerId: customer.id, virtualAccountNumber, bankName, branchCode };
}

// ─── Stripeウェブフック処理（着金イベント）──────────────────
export async function handleStripeWebhook(
  rawBody:   string,
  signature: string,
): Promise<{ processed: boolean; event?: string }> {
  const stripe        = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    console.error("[Stripe Webhook] Signature verification failed:", {
      signature: signature?.slice(0, 20) + "...",
      error: e instanceof Error ? e.message : String(e),
    });
    throw new Error("Webhook signature verification failed");
  }

  // ── カード決済完了 ──────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session  = event.data.object as Record<string, unknown>;
    const meta     = session.metadata as Record<string, string> | undefined;
    const buyerId  = meta?.buyerId;
    if (!buyerId || session.payment_status !== "paid") return { processed: false };

    const amountJpy = parseInt(meta?.amountJpy ?? "0", 10);
    if (!amountJpy) return { processed: false };

    const { fetchJpycRate } = await import("./jpyc-verify.js");
    const rateStr           = await fetchJpycRate();
    const { Decimal }       = await import("@prisma/client/runtime/library");
    const amountUsdc        = new Decimal(amountJpy).div(new Decimal(rateStr));

    await prisma.$transaction(async (tx) => {
      const buyer          = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
      const currentBalance = new Decimal(String((buyer as Record<string, unknown>).balanceUsdc ?? "0"));
      await tx.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: currentBalance.add(amountUsdc) } as never,
      });
    });

    return { processed: true, event: event.type };
  }

  // customer_cash_balance_transaction.created (新API) または customer.balance.funded (旧API) に対応
  if (event.type === "customer_cash_balance_transaction.created" || event.type === "customer.balance.funded") {
    const funded     = event.data.object as Record<string, unknown>;
    const customerId = (funded.customer ?? funded.customer_id) as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customer  = await stripe.customers.retrieve(customerId) as any;
    const buyerId   = customer.metadata?.buyerId;
    if (!buyerId) return { processed: false };

    const amountJpy      = (funded.amount as number) ?? 0;
    const rateJpyPerUsdc = parseFloat(process.env.JPY_USDC_RATE ?? "150");

    // Decimal演算で浮動小数点誤差を回避
    const { Decimal } = await import("@prisma/client/runtime/library");
    const amountUsdc = new Decimal(amountJpy).div(new Decimal(rateJpyPerUsdc));

    await prisma.$transaction(async (tx) => {
      const buyer = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
      const currentBalance = new Decimal(String((buyer as Record<string, unknown>).balanceUsdc ?? "0"));
      await tx.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: currentBalance.add(amountUsdc) } as never,
      });
    });

    return { processed: true, event: event.type };
  }

  return { processed: false, event: event.type };
}

// ─── Stripe Checkout セッション作成（カード決済）──────────────
export async function createCardCheckoutSession(
  buyerId:    string,
  amountJpy:  number,   // JPY 金額 (最低 ¥500)
  successUrl: string,
  cancelUrl:  string,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode:                 "payment",
    currency:             "jpy",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency:     "jpy",
        unit_amount:  amountJpy,
        product_data: { name: "LEMON cake USDC残高チャージ", description: `¥${amountJpy.toLocaleString()} → USDCに換算して残高に追加` },
      },
      quantity: 1,
    }],
    metadata:    { buyerId, amountJpy: String(amountJpy) },
    success_url: successUrl,
    cancel_url:  cancelUrl,
  });

  return { sessionId: session.id, url: session.url as string };
}

// ─── カスタマーの残高照会 ─────────────────────────────────────
export async function getStripeCustomerBalance(
  customerId: string,
): Promise<{ cash: number; currency: string }> {
  const stripe  = getStripe();
  const balance = await stripe.customers.retrieveBalanceTransactions(customerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cash    = balance.data.reduce((sum: number, tx: any) => sum + tx.amount, 0);
  return { cash, currency: "jpy" };
}
