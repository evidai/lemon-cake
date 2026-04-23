/**
 * 本番 Buyer の掃除スクリプト
 *
 * 残す: email = test@aievid.com / name or email に "freee" を含む
 * 消す: それ以外すべて (関連テーブルも同時削除)
 *
 * 使い方:
 *   railway run npx tsx scripts/cleanup-test-buyers.ts           # dry-run (デフォルト)
 *   railway run npx tsx scripts/cleanup-test-buyers.ts --execute # 実行
 */

import { prisma } from "../src/lib/prisma.js";

const EXECUTE = process.argv.includes("--execute");

function shouldKeep(b: { name: string; email: string }) {
  if (b.email.toLowerCase() === "test@aievid.com") return true;
  const needle = (b.name + " " + b.email).toLowerCase();
  if (needle.includes("freee")) return true;
  return false;
}

async function main() {
  const all = await prisma.buyer.findMany({
    select: { id: true, name: true, email: true, balanceUsdc: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const keep   = all.filter(shouldKeep);
  const delete_ = all.filter(b => !shouldKeep(b));

  console.log(`\n=== Buyer 合計: ${all.length} 件 ===`);
  console.log(`\n[残す] ${keep.length} 件`);
  for (const b of keep) {
    console.log(`  ✓ ${b.id.slice(0,8)}  ${b.email.padEnd(30)}  ${b.name.padEnd(20)}  $${b.balanceUsdc.toString()}`);
  }
  console.log(`\n[削除] ${delete_.length} 件`);
  for (const b of delete_) {
    console.log(`  ✗ ${b.id.slice(0,8)}  ${b.email.padEnd(30)}  ${b.name.padEnd(20)}  $${b.balanceUsdc.toString()}`);
  }

  if (!EXECUTE) {
    console.log(`\n[DRY RUN] 実行するには --execute を付ける`);
    return;
  }

  console.log(`\n[EXECUTE] 削除開始...`);
  const ids = delete_.map(b => b.id);

  await prisma.$transaction(async (tx) => {
    const r1 = await tx.chargeRollup.deleteMany({ where: { buyerId: { in: ids } } });
    const r2 = await tx.charge.deleteMany({ where: { buyerId: { in: ids } } });
    const r3 = await tx.token.deleteMany({ where: { buyerId: { in: ids } } });
    const r4 = await tx.jpycDepositRequest.deleteMany({ where: { buyerId: { in: ids } } });
    const r5 = await tx.workflow.deleteMany({ where: { buyerId: { in: ids } } });
    const r6 = await tx.buyerAccountingConnection.deleteMany({ where: { buyerId: { in: ids } } });
    // User.buyerId / Provider.buyerId は optional unique → null に
    const r7 = await tx.user.updateMany({ where: { buyerId: { in: ids } }, data: { buyerId: null } });
    const r8 = await tx.provider.updateMany({ where: { buyerId: { in: ids } }, data: { buyerId: null } });
    const r9 = await tx.buyer.deleteMany({ where: { id: { in: ids } } });

    console.log(`  ChargeRollup            deleted: ${r1.count}`);
    console.log(`  Charge                  deleted: ${r2.count}`);
    console.log(`  Token                   deleted: ${r3.count}`);
    console.log(`  JpycDepositRequest      deleted: ${r4.count}`);
    console.log(`  Workflow                deleted: ${r5.count}`);
    console.log(`  BuyerAccountingConnection deleted: ${r6.count}`);
    console.log(`  User.buyerId            nullified: ${r7.count}`);
    console.log(`  Provider.buyerId        nullified: ${r8.count}`);
    console.log(`  Buyer                   deleted: ${r9.count}`);
  });

  console.log(`\n✅ 完了`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
