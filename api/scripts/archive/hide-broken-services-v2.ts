import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // verified=false に既に下げたものを reviewStatus=PENDING にも下げる
  // (これで MCP が GET /api/services?reviewStatus=APPROVED で取得しても見えなくなる)
  const result = await p.service.updateMany({
    where: { verified: false, reviewStatus: "APPROVED" },
    data:  { reviewStatus: "PENDING" },
  });
  console.log(`✅ Set ${result.count} services to reviewStatus=PENDING (hidden from agents)`);

  const visible = await p.service.count({ where: { reviewStatus: "APPROVED", verified: true } });
  console.log(`\nVisible to agents now: ${visible} services`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
