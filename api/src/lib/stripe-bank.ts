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
  } catch {
    throw new Error("Webhook signature verification failed");
  }

  if (event.type === "customer.balance.funded") {
    const funded     = event.data.object as Record<string, unknown>;
    const customerId = funded.customer as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customer  = await stripe.customers.retrieve(customerId) as any;
    const buyerId   = customer.metadata?.buyerId;
    if (!buyerId) return { processed: false };

    const amountJpy     = (funded.amount as number) ?? 0;
    const rateJpyPerUsdc = parseFloat(process.env.JPY_USDC_RATE ?? "150");
    const amountUsdc    = (amountJpy / rateJpyPerUsdc).toFixed(6);

    await prisma.$transaction(async (tx) => {
      const buyer   = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
      const current = parseFloat(String((buyer as Record<string, unknown>).balanceUsdc ?? "0"));
      await tx.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: (current + parseFloat(amountUsdc)).toFixed(6) } as never,
      });
    });

    return { processed: true, event: event.type };
  }

  return { processed: false, event: event.type };
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
