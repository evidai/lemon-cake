/**
 * Stripe マルチ通貨チャージ (Customer Balance)
 *
 * 対応通貨: USD / JPY / EUR / GBP
 * カード決済・銀行振込どちらも対応
 * 着金時に USDC へ自動換算して残高に反映
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require("stripe").default ?? require("stripe");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeClient = any;
import { prisma } from "./prisma.js";

export type SupportedCurrency = "usd" | "jpy" | "eur" | "gbp";

function getStripe(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key, { apiVersion: "2026-03-25.dahlia" });
}

// ─── 通貨 → USDC レート取得 ──────────────────────────────────
// USD: 1:1, JPY: env var, EUR/GBP: env var or CoinGecko fallback
async function getCurrencyToUsdcRate(currency: SupportedCurrency): Promise<number> {
  switch (currency) {
    case "usd": return 1.0;
    case "jpy": return 1 / parseFloat(process.env.JPY_USDC_RATE ?? "150");
    case "eur": {
      const rate = process.env.EUR_USDC_RATE;
      if (rate) return parseFloat(rate);
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=eur");
        const d   = await res.json() as { "usd-coin"?: { eur?: number } };
        const eur = d?.["usd-coin"]?.eur;
        return eur ? 1 / eur : 1.08;
      } catch { return 1.08; }
    }
    case "gbp": {
      const rate = process.env.GBP_USDC_RATE;
      if (rate) return parseFloat(rate);
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=gbp");
        const d   = await res.json() as { "usd-coin"?: { gbp?: number } };
        const gbp = d?.["usd-coin"]?.gbp;
        return gbp ? 1 / gbp : 1.27;
      } catch { return 1.27; }
    }
    default: return 1.0;
  }
}

// ─── Stripe amount unit ───────────────────────────────────────
// JPY は最小単位が円 (0 decimal), USD/EUR/GBP は cents (2 decimal)
function toStripeAmount(amount: number, currency: SupportedCurrency): number {
  return currency === "jpy" ? Math.round(amount) : Math.round(amount * 100);
}

function fromStripeAmount(stripeAmount: number, currency: SupportedCurrency): number {
  return currency === "jpy" ? stripeAmount : stripeAmount / 100;
}

// ─── 通貨別 bank_transfer type ────────────────────────────────
function bankTransferType(currency: SupportedCurrency): string {
  switch (currency) {
    case "jpy": return "jp_bank_transfer";
    case "usd": return "us_bank_transfer";
    case "eur": return "eu_bank_transfer";
    case "gbp": return "gb_bank_transfer";
    default:    return "us_bank_transfer";
  }
}

// ─── 銀行口座情報の型 ─────────────────────────────────────────
export interface BankDetails {
  type:           "zengin" | "aba" | "iban" | "sort_code" | null;
  // JP zengin
  accountNumber?: string;
  bankName?:      string;
  branchCode?:    string;
  // US aba
  routingNumber?: string;
  accountType?:   string;
  // EU iban
  iban?:          string;
  bic?:           string;
  // GB sort_code
  sortCode?:      string;
}

export interface CreateBankTransferAccountResult {
  customerId:  string;
  bankDetails: BankDetails | null;
}

// ─── バーチャル口座発行 ───────────────────────────────────────
export async function createBankTransferAccount(
  buyerId:  string,
  email:    string,
  name:     string,
  currency: SupportedCurrency = "jpy",
): Promise<CreateBankTransferAccountResult> {
  const stripe = getStripe();

  // 既存カスタマーがあれば再利用
  const existingBuyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  let customerId = existingBuyer?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email, name,
      metadata:          { buyerId },
      preferred_locales: [currency === "jpy" ? "ja-JP" : "en-US"],
    });
    customerId = customer.id as string;
    await prisma.buyer.update({ where: { id: buyerId }, data: { stripeCustomerId: customerId } });
  }

  let bankDetails: BankDetails | null = null;

  try {
    const pi = await stripe.paymentIntents.create({
      amount:               toStripeAmount(1, currency), // dummy ¥1 / $0.01
      currency,
      customer:             customerId,
      payment_method_types: ["customer_balance"],
      payment_method_data:  { type: "customer_balance" },
      confirm:              true,
      payment_method_options: {
        customer_balance: {
          funding_type:  "bank_transfer",
          bank_transfer: { type: bankTransferType(currency) },
        },
      },
    } as Parameters<typeof stripe.paymentIntents.create>[0]);

    const instructions = (pi.next_action as Record<string, unknown>)
      ?.display_bank_transfer_instructions as Record<string, unknown> | undefined;
    const addresses = instructions?.financial_addresses as Array<Record<string, unknown>> | undefined;

    if (currency === "jpy") {
      const zengin = addresses?.find(fa => fa.type === "zengin")?.zengin as Record<string, string> | undefined;
      if (zengin) bankDetails = {
        type: "zengin",
        accountNumber: zengin.account_number,
        bankName:      zengin.bank_name,
        branchCode:    zengin.branch_code,
      };
    } else if (currency === "usd") {
      const aba = addresses?.find(fa => fa.type === "aba")?.aba as Record<string, string> | undefined;
      if (aba) bankDetails = {
        type:          "aba",
        routingNumber: aba.routing_number,
        accountNumber: aba.account_number,
        accountType:   aba.account_type,
        bankName:      aba.bank_name,
      };
    } else if (currency === "eur") {
      const iban = addresses?.find(fa => fa.type === "iban")?.iban as Record<string, string> | undefined;
      if (iban) bankDetails = {
        type: "iban",
        iban: iban.iban,
        bic:  iban.bic,
        bankName: iban.bank_name,
      };
    } else if (currency === "gbp") {
      const sort = addresses?.find(fa => fa.type === "sort_code")?.sort_code as Record<string, string> | undefined;
      if (sort) bankDetails = {
        type:          "sort_code",
        sortCode:      sort.sort_code,
        accountNumber: sort.account_number,
        bankName:      sort.bank_name,
      };
    }
  } catch (e) {
    console.error("[Stripe] bank transfer account creation failed:", e);
  }

  return { customerId, bankDetails };
}

// ─── Stripeウェブフック処理 ───────────────────────────────────
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
    console.error("[Stripe Webhook] Signature verification failed:", e instanceof Error ? e.message : e);
    throw new Error("Webhook signature verification failed");
  }

  // ── カード決済完了 ──────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Record<string, unknown>;
    const meta    = session.metadata as Record<string, string> | undefined;
    const buyerId = meta?.buyerId;
    if (!buyerId || session.payment_status !== "paid") return { processed: false };

    const amount   = parseInt(meta?.amount   ?? "0",   10);
    const currency = (meta?.currency ?? "jpy") as SupportedCurrency;
    if (!amount) return { processed: false };

    const rate       = await getCurrencyToUsdcRate(currency);
    const { Decimal } = await import("@prisma/client/runtime/library");
    const amountUsdc  = new Decimal(amount).mul(new Decimal(rate));

    await prisma.$transaction(async (tx) => {
      const buyer          = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
      const currentBalance = new Decimal(String((buyer as Record<string, unknown>).balanceUsdc ?? "0"));
      await tx.buyer.update({ where: { id: buyerId }, data: { balanceUsdc: currentBalance.add(amountUsdc) } as never });
    });

    console.log(`[Stripe] card deposit: buyerId=${buyerId} ${amount} ${currency} → ${amountUsdc.toFixed(6)} USDC`);
    return { processed: true, event: event.type };
  }

  // ── 銀行振込着金 ────────────────────────────────────────────
  if (
    event.type === "customer_cash_balance_transaction.created" ||
    event.type === "customer.balance.funded"
  ) {
    const funded     = event.data.object as Record<string, unknown>;
    const customerId = (funded.customer ?? funded.customer_id) as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customer  = await stripe.customers.retrieve(customerId) as any;
    const buyerId   = customer.metadata?.buyerId;
    if (!buyerId) return { processed: false };

    // Stripe amount は通貨の最小単位
    const stripeAmount = (funded.amount as number) ?? 0;
    const currency     = ((funded.currency as string) ?? "jpy") as SupportedCurrency;
    const naturalAmount = fromStripeAmount(stripeAmount, currency);

    const rate       = await getCurrencyToUsdcRate(currency);
    const { Decimal } = await import("@prisma/client/runtime/library");
    const amountUsdc  = new Decimal(naturalAmount).mul(new Decimal(rate));

    await prisma.$transaction(async (tx) => {
      const buyer          = await tx.buyer.findUniqueOrThrow({ where: { id: buyerId } });
      const currentBalance = new Decimal(String((buyer as Record<string, unknown>).balanceUsdc ?? "0"));
      await tx.buyer.update({ where: { id: buyerId }, data: { balanceUsdc: currentBalance.add(amountUsdc) } as never });
    });

    console.log(`[Stripe] bank transfer: buyerId=${buyerId} ${naturalAmount} ${currency} → ${amountUsdc.toFixed(6)} USDC`);
    return { processed: true, event: event.type };
  }

  return { processed: false, event: event.type };
}

// ─── カード決済 Checkout セッション ──────────────────────────
export async function createCardCheckoutSession(
  buyerId:    string,
  amount:     number,           // 自然単位 (例: USD=5.00, JPY=750)
  currency:   SupportedCurrency,
  successUrl: string,
  cancelUrl:  string,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();

  const currencyLabels: Record<SupportedCurrency, string> = {
    usd: "USD", jpy: "JPY", eur: "EUR", gbp: "GBP",
  };

  const session = await stripe.checkout.sessions.create({
    mode:                 "payment",
    currency,
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency,
        unit_amount:  toStripeAmount(amount, currency),
        product_data: {
          name:        "LEMON cake USDC残高チャージ",
          description: `${amount} ${currencyLabels[currency]} → USDCに換算して残高に追加`,
        },
      },
      quantity: 1,
    }],
    metadata:    { buyerId, amount: String(amount), currency },
    success_url: successUrl,
    cancel_url:  cancelUrl,
  });

  return { sessionId: session.id, url: session.url as string };
}

// ─── カスタマー残高照会 ───────────────────────────────────────
export async function getStripeCustomerBalance(
  customerId: string,
): Promise<{ cash: number; currency: string }> {
  const stripe  = getStripe();
  const balance = await stripe.customers.retrieveBalanceTransactions(customerId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cash    = balance.data.reduce((sum: number, tx: any) => sum + tx.amount, 0);
  return { cash, currency: "jpy" };
}
