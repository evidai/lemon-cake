import { PrismaClient, Prisma } from "@prisma/client";

// 採算ライン: 2% 手数料でも黒字を担保
// pricePerCall × 0.02 >= 0.0001 → pricePerCall >= 0.005 USDC
const MIN_PRICE = new Prisma.Decimal("0.005");

async function main() {
  const p = new PrismaClient();

  const all = await p.service.findMany({
    select: { id: true, name: true, pricePerCallUsdc: true, reviewStatus: true },
    orderBy: { pricePerCallUsdc: "asc" },
  });

  console.log(`Total services: ${all.length}`);
  console.log(`Min price floor: ${MIN_PRICE.toFixed(6)} USDC\n`);

  const tooCheap = all.filter(s => s.pricePerCallUsdc.lt(MIN_PRICE));
  console.log(`Below floor: ${tooCheap.length}\n`);

  for (const s of tooCheap) {
    console.log(`  ${s.pricePerCallUsdc.toFixed(6)} → 0.005000  ${s.id} ${s.name}`);
  }

  if (tooCheap.length === 0) { console.log("Nothing to update."); await p.$disconnect(); return; }

  console.log("\nApplying...");
  const result = await p.service.updateMany({
    where: { pricePerCallUsdc: { lt: MIN_PRICE } },
    data:  { pricePerCallUsdc: MIN_PRICE },
  });
  console.log(`✅ Updated ${result.count} service(s)`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
