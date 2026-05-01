import { readFileSync } from "fs";
import { resolve } from "path";
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    select: { id: true, email: true, name: true, provider: true, buyerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("─── User table (全" + users.length + "件) ───");
  for (const u of users) {
    const linked = u.buyerId ? "✓Buyer" : "—";
    console.log(`${u.createdAt.toISOString().slice(0,10)}  ${u.provider.padEnd(7)}  ${linked}  ${u.email}  (${u.name})`);
  }
  const buyers = await p.buyer.findMany({
    select: { id: true, email: true, name: true, kycTier: true, createdAt: true, balanceUsdc: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("\n─── Buyer table (全" + buyers.length + "件) ───");
  for (const b of buyers) {
    console.log(`${b.createdAt.toISOString().slice(0,10)}  ${b.kycTier.padEnd(4)}  bal=${b.balanceUsdc}  ${b.email}  (${b.name})`);
  }
  await p.$disconnect();
})().catch(async e => { console.error(e); await p.$disconnect(); process.exit(1); });
