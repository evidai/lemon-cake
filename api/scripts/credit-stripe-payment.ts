import { PrismaClient, Prisma } from "@prisma/client";

async function main() {
  const p = new PrismaClient();

  // ¥786 → USDC (JPY_USDC_RATE=150)
  const amountJpy  = 786;
  const rate       = 150;
  const amountUsdc = new Prisma.Decimal(amountJpy).div(rate);
  console.log(`¥${amountJpy} → ${amountUsdc.toFixed(6)} USDC`);

  const buyer = await p.buyer.findFirst({ where: { user: { email: "test@aievid.com" } } });
  if (!buyer) { console.log("Buyer not found"); return; }

  const updated = await p.buyer.update({
    where: { id: buyer.id },
    data:  { balanceUsdc: { increment: amountUsdc } },
  });
  console.log("✅ 新残高:", updated.balanceUsdc.toString(), "USDC");

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
