import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // test@aievid.com の buyer
  const buyer = await p.buyer.findFirst({ 
    where: { user: { email: "test@aievid.com" } },
    select: { id: true, balanceUsdc: true, heldUsdc: true }
  });
  console.log("Buyer balance:", buyer);

  // 最近の JPYC deposit requests
  const deposits = await p.jpycDepositRequest.findMany({
    where: { buyerId: buyer?.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, status: true, amountJpyc: true, stripeSessionId: true, createdAt: true }
  });
  console.log("\nRecent deposits:", JSON.stringify(deposits, null, 2));

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
