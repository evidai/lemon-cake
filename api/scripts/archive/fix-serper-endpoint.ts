import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const updated = await p.service.update({
    where: { id: "cmnxgmxn1000872zrit4ft7kc" },
    data: { endpoint: "https://google.serper.dev" },
  });
  console.log("✅ endpoint:", updated.endpoint);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
