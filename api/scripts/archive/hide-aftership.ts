import { PrismaClient } from "@prisma/client";
async function main() {
  const p = new PrismaClient();
  // AfterShip は API key 必須だが auth=none → 401 確定。hide
  const res = await p.service.updateMany({
    where: { name: { contains: "AfterShip" } },
    data:  { reviewStatus: "PENDING" },
  });
  console.log(`✅ Hidden ${res.count} AfterShip service(s)`);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
