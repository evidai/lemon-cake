// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require("stripe").default ?? require("stripe");

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { console.log("No STRIPE_SECRET_KEY"); return; }
  const stripe = new Stripe(key, { apiVersion: "2026-03-25.dahlia" });

  const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
  console.log(`Found ${webhooks.data.length} webhook endpoint(s):`);
  for (const ep of webhooks.data) {
    console.log(`\n  URL: ${ep.url}`);
    console.log(`  Status: ${ep.status}`);
    console.log(`  Events: ${ep.enabled_events.join(", ")}`);
  }

  // 最近の checkout sessions を確認
  const sessions = await stripe.checkout.sessions.list({ limit: 5 });
  console.log(`\nRecent checkout sessions:`);
  for (const s of sessions.data) {
    console.log(`  ${s.id}: status=${s.status} payment_status=${s.payment_status} amount=${s.amount_total} metadata=${JSON.stringify(s.metadata)}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
