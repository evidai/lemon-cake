// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require("stripe").default ?? require("stripe");
import { PrismaClient, Prisma } from "@prisma/client";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY!;
  const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

  // 1. 既存の古い webhook を削除して新しい URL + イベントで再登録
  const existing = await stripe.webhookEndpoints.list({ limit: 10 });
  for (const ep of existing.data) {
    if (ep.url.includes("railway.app")) {
      await stripe.webhookEndpoints.del(ep.id);
      console.log(`Deleted old webhook: ${ep.url}`);
    }
  }

  const newEp = await stripe.webhookEndpoints.create({
    url: "https://api.lemoncake.xyz/api/stripe/webhook",
    enabled_events: [
      "checkout.session.completed",
      "customer_cash_balance_transaction.created",
    ],
  });
  console.log(`✅ Created webhook: ${newEp.url}`);
  console.log(`   Secret: ${newEp.secret}`);
  console.log(`   Events: ${newEp.enabled_events.join(", ")}`);

  // 2. 残高を 5.24 → 5.00 USDC に修正（$5 USD = 5 USDC）
  const p = new PrismaClient();
  const updated = await p.buyer.update({
    where: { id: "cmnuyqfcb0003a4ee8e9cxurx" },
    data:  { balanceUsdc: new Prisma.Decimal("5.000000") },
  });
  console.log(`\n✅ Balance fixed: ${updated.balanceUsdc} USDC`);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
