import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  const buyer = await p.buyer.findFirst({ where: { user: { email: "test@aievid.com" } } });
  console.log("=== Buyer ===");
  console.log(`  balanceUsdc: ${buyer?.balanceUsdc}`);

  const token = await p.token.findUnique({ where: { id: "cmomhvs4u0003tf4ku6qxxn2t" } });
  console.log("\n=== Demo Token ===");
  console.log(`  sandbox:   ${token?.sandbox}`);
  console.log(`  limitUsdc: ${token?.limitUsdc}`);
  console.log(`  usedUsdc:  ${token?.usedUsdc}`);

  const newSchemaCharges = await p.charge.count({ where: { platformFeeUsdc: { not: null } } });
  console.log(`\n=== Charges with new fee split (post-deploy) === ${newSchemaCharges}`);

  const platformRev = await p.platformRevenue.aggregate({ _sum: { amountUsdc: true }, _count: true });
  console.log("\n=== PlatformRevenue ===");
  console.log(`  count:     ${platformRev._count}`);
  console.log(`  totalUsdc: ${platformRev._sum.amountUsdc?.toString() ?? "0"}`);

  const providers = await p.provider.findMany({
    where:  { pendingPayoutUsdc: { gt: 0 } },
    select: { id: true, name: true, pendingPayoutUsdc: true },
  });
  console.log("\n=== Providers with pending balance ===");
  for (const pr of providers) console.log(`  ${pr.name}: ${pr.pendingPayoutUsdc}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
