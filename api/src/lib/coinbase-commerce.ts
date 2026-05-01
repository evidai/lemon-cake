/**
 * Coinbase Commerce 統合
 *
 * Stripe (3.6%/件) を回避してバイヤーが直接 USDC で残高チャージできる経路。
 * バイヤーは hosted checkout で USDC/ETH/Bitcoin etc を送金、
 * Coinbase 側が webhook で完了通知 → こちらで balanceUsdc を加算。
 *
 * Coinbase Commerce 手数料: 1% (Stripe の 3.6% より安い)
 *
 * 環境変数:
 *   COINBASE_COMMERCE_API_KEY        — https://beta.commerce.coinbase.com/settings
 *   COINBASE_COMMERCE_WEBHOOK_SECRET — webhook 設定時に発行される shared secret
 *
 * docs: https://docs.cloud.coinbase.com/commerce-onchain/docs/welcome
 */

import { prisma } from "./prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";

const API_BASE = "https://api.commerce.coinbase.com";

function getApiKey(): string {
  const key = process.env.COINBASE_COMMERCE_API_KEY;
  if (!key) throw new Error("COINBASE_COMMERCE_API_KEY is not set");
  return key;
}

// ─── Charge 作成 ──────────────────────────────────────────────
export interface CreateChargeParams {
  buyerId:    string;
  amountUsd:  number;   // バイヤーが支払う USD 相当額 (USDC は 1:1)
  successUrl: string;
  cancelUrl:  string;
}

export interface CoinbaseChargeResult {
  chargeId:    string;
  hostedUrl:   string;
  expiresAt:   string;
  pricingType: string;
}

export async function createCoinbaseCharge(params: CreateChargeParams): Promise<CoinbaseChargeResult> {
  const apiKey = getApiKey();

  const body = {
    name:        "LemonCake USDC残高チャージ",
    description: `${params.amountUsd} USD 相当の USDC を残高に追加`,
    pricing_type: "fixed_price",
    local_price: { amount: params.amountUsd.toFixed(2), currency: "USD" },
    metadata:    { buyerId: params.buyerId, amountUsd: String(params.amountUsd) },
    redirect_url: params.successUrl,
    cancel_url:   params.cancelUrl,
  };

  const res = await fetch(`${API_BASE}/charges`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "X-CC-Api-Key":      apiKey,
      "X-CC-Version":      "2018-03-22",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coinbase Commerce createCharge failed: ${res.status} ${text}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  return {
    chargeId:    data.data.id,
    hostedUrl:   data.data.hosted_url,
    expiresAt:   data.data.expires_at,
    pricingType: data.data.pricing_type,
  };
}

// ─── Webhook 署名検証 ─────────────────────────────────────────
export function verifyCoinbaseWebhook(rawBody: string, signature: string | undefined): boolean {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret) throw new Error("COINBASE_COMMERCE_WEBHOOK_SECRET is not set");
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // タイミング攻撃対策の constant-time 比較
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Webhook 処理 ─────────────────────────────────────────────
// charge:confirmed → buyer.balanceUsdc += amountUsd (1 USD = 1 USDC)
export async function handleCoinbaseWebhook(rawBody: string, signature: string | undefined): Promise<{
  processed: boolean;
  event?: string;
  reason?: string;
}> {
  if (!verifyCoinbaseWebhook(rawBody, signature)) {
    throw new Error("Invalid Coinbase Commerce webhook signature");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = JSON.parse(rawBody) as any;
  const type    = event?.event?.type as string | undefined;
  const charge  = event?.event?.data;

  if (!type || !charge) return { processed: false, reason: "malformed_event" };

  // charge:confirmed = blockchain で確認済み (refundable まで進んだ後でないので charge:resolved も確認)
  // 簡略化: charge:confirmed と charge:resolved の両方を扱う (冪等性チェックあり)
  if (type !== "charge:confirmed" && type !== "charge:resolved") {
    return { processed: false, event: type, reason: "ignored_event" };
  }

  const buyerId   = charge?.metadata?.buyerId as string | undefined;
  const amountUsd = parseFloat(charge?.metadata?.amountUsd ?? "0");
  const chargeId  = charge?.id as string | undefined;

  if (!buyerId || !amountUsd || !chargeId) {
    return { processed: false, event: type, reason: "missing_metadata" };
  }

  // 冪等性: 同じ Coinbase chargeId を 2 回処理しない
  // 簡易的に JpycDepositRequest テーブルの txHash フィールドを再利用
  // (txHash に "coinbase:<chargeId>" を入れて UNIQUE 制約で防御)
  const dedupeKey = `coinbase:${chargeId}`;

  const existing = await prisma.jpycDepositRequest.findUnique({ where: { txHash: dedupeKey } });
  if (existing) {
    return { processed: false, event: type, reason: "already_processed" };
  }

  const amountDec = new Decimal(amountUsd);

  await prisma.$transaction(async (tx) => {
    await tx.jpycDepositRequest.create({
      data: {
        buyerId,
        txHash:     dedupeKey,
        amountJpyc: amountDec.mul(150),  // 参考値: USDC × 150 = JPY 相当
        amountUsdc: amountDec,
        status:     "APPROVED",
        reviewNote: `Coinbase Commerce ${type} via webhook`,
        reviewedAt: new Date(),
      },
    });
    await tx.buyer.update({
      where: { id: buyerId },
      data:  { balanceUsdc: { increment: amountDec } },
    });
  });

  console.log(`[Coinbase] ✅ ${type}: buyer ${buyerId} +${amountDec.toFixed(2)} USDC (charge ${chargeId})`);
  return { processed: true, event: type };
}
