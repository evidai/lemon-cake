import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const payouts = await p.providerPayout.count();
  const pendingProviders = await p.provider.count({ where: { pendingPayoutUsdc: { gt: 0 } } });
  const totalPending = await p.provider.aggregate({ _sum: { pendingPayoutUsdc: true } });
  const totalPaidOut = await p.provider.aggregate({ _sum: { totalPaidOutUsdc: true } });
  const recent = await p.providerPayout.findMany({ orderBy: { createdAt: "desc" }, take: 3, include: { provider: { select: { name: true } } } });
  console.log("ProviderPayout records:", payouts);
  console.log("Providers with pending balance:", pendingProviders);
  console.log("Total pending USDC:", totalPending._sum.pendingPayoutUsdc?.toString() ?? "0");
  console.log("Total paid out (lifetime):", totalPaidOut._sum.totalPaidOutUsdc?.toString() ?? "0");
  if (recent.length) {
    console.log("\nRecent payouts:");
    for (const r of recent) console.log(`  ${r.createdAt.toISOString()} ${r.provider.name} ${r.amountUsdc} ${r.status}`);
  } else {
    console.log("\nNo payouts yet (cron hasn't run because no provider has $10+ pending)");
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
