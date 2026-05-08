import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  const payouts = await p.providerPayout.count();
  const pendingProviders = await p.provider.count({ where: { pendingPayoutUsdc: { gt: 0 } } });
  const totalPending = await p.provider.aggregate({ _sum: { pendingPayoutUsdc: true } });
  console.log("ProviderPayout records:", payouts);
  console.log("Providers with pending balance:", pendingProviders);
  console.log("Total pending USDC:", totalPending._sum.pendingPayoutUsdc?.toString() ?? "0");
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
