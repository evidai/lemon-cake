import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const SERPER_ID = "cmnxgmxn1000872zrit4ft7kc";

  const updated = await p.service.update({
    where: { id: SERPER_ID },
    data: { authHeader: "X-API-Key: 51c628161bcbef1a638d4d97499adebdd9bcf1b8" },
  });
  console.log("✅ Serper authHeader:", updated.authHeader);
  console.log("   endpoint:", updated.endpoint);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
