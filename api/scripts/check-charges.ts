import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const charges = await p.charge.findMany({ 
    orderBy: { createdAt: 'desc' }, 
    take: 5, 
    select: { id: true, serviceId: true, amountUsdc: true, status: true, createdAt: true } 
  });
  console.log("Recent charges:");
  console.log(JSON.stringify(charges, null, 2));
  const count = await p.charge.count();
  console.log(`Total charges: ${count}`);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
