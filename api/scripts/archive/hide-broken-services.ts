import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // endpoint 未設定のものを verified=false に下げる (DB には残すが agent から見えなくする)
  const broken = await p.service.findMany({
    where:  { endpoint: null, verified: true },
    select: { id: true, name: true },
  });

  console.log(`Hiding ${broken.length} services without endpoint:\n`);
  for (const s of broken) console.log(`  - ${s.name}`);

  if (broken.length === 0) { console.log("\nNothing to hide."); await p.$disconnect(); return; }

  const result = await p.service.updateMany({
    where: { endpoint: null, verified: true },
    data:  { verified: false },
  });
  console.log(`\n✅ Marked ${result.count} as verified=false (still APPROVED in DB but hidden from agent list_services if proxy filters by verified)`);

  // 残った verified サービス
  const remaining = await p.service.findMany({
    where:  { verified: true, reviewStatus: "APPROVED" },
    select: { id: true, name: true, authHeader: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n=== ${remaining.length} active services (visible to agents) ===`);
  for (const s of remaining) console.log(`  ${s.authHeader ? "🔑" : "🆓"} ${s.name}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
