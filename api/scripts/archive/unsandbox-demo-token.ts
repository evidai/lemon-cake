import { PrismaClient } from "@prisma/client";

const TOKEN_ID = "cmomhvs4u0003tf4ku6qxxn2t";

async function main() {
  const p = new PrismaClient();

  const before = await p.token.findUnique({ where: { id: TOKEN_ID } });
  if (!before) { console.log(`Token ${TOKEN_ID} not found`); return; }
  console.log(`Token ${TOKEN_ID}`);
  console.log(`  scope:    ${before.scope}`);
  console.log(`  sandbox:  ${before.sandbox}  ← will set to false`);
  console.log(`  limitUsdc: ${before.limitUsdc}`);
  console.log(`  usedUsdc:  ${before.usedUsdc}`);

  const after = await p.token.update({
    where: { id: TOKEN_ID },
    data:  { sandbox: false },
  });
  console.log(`\n✅ Switched to production. New sandbox = ${after.sandbox}`);
  console.log(`\n以降この token で API を呼ぶと:`);
  console.log(`  - buyer.balanceUsdc から実引き落とし`);
  console.log(`  - provider 分は pendingPayoutUsdc に accrue`);
  console.log(`  - platform 手数料 (2.5%) は HOT_WALLET 内に蓄積`);
  console.log(`  - $10+ pending な provider があれば翌 JST 09:00 にバッチ送金`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
