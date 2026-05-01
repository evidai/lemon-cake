import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  const buyer = await p.buyer.findFirst({ where: { user: { email: "test@aievid.com" } } });
  if (!buyer) { console.log("Buyer not found"); await p.$disconnect(); return; }
  console.log("Buyer:", buyer.id, "current balance:", buyer.balanceUsdc.toString());

  const updated = await p.buyer.update({
    where: { id: buyer.id },
    data: { balanceUsdc: "0" },
  });
  console.log("✅ balanceUsdc:", updated.balanceUsdc.toString());

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
