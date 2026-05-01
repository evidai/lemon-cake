import { readFileSync } from "fs";
import { resolve } from "path";
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const now = new Date();
  const d7 = new Date(Date.now() - 7*86400_000);
  const d30 = new Date(Date.now() - 30*86400_000);
  const [
    buyerTotal, buyer7d, buyer30d,
    sellerTotal,
    chargeTotal, charge7d,
    accountingConn,
  ] = await Promise.all([
    p.buyer.count(),
    p.buyer.count({ where: { createdAt: { gte: d7 } } }),
    p.buyer.count({ where: { createdAt: { gte: d30 } } }),
    p.user.count({ where: { role: "SELLER" as any } }).catch(() => p.user.count()),
    p.charge.count({ where: { status: "COMPLETED" } }),
    p.charge.count({ where: { status: "COMPLETED", createdAt: { gte: d7 } } }),
    p.buyerAccountingConnection.count({ where: { active: true } }),
  ]);
  const charged = await p.charge.aggregate({ where: { status: "COMPLETED" }, _sum: { amountUsdc: true } });
  console.log("─── LemonCake user stats (" + now.toISOString().slice(0,10) + ") ───");
  console.log(`Buyer (登録ユーザー): ${buyerTotal}`);
  console.log(`  ↳ 過去7日: ${buyer7d}  /  過去30日: ${buyer30d}`);
  console.log(`Seller / User全体: ${sellerTotal}`);
  console.log(`完了Charge数: ${chargeTotal}  (過去7日: ${charge7d})`);
  console.log(`完了Charge合計: ${charged._sum.amountUsdc?.toString() ?? "0"} USDC`);
  console.log(`会計連携アクティブ: ${accountingConn}`);
  await p.$disconnect();
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
