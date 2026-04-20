/**
 * freee 審査用デモアカウント作成スクリプト
 *
 * 実行 (local):       npx tsx prisma/seed-freee-demo.ts
 * 実行 (production):  DATABASE_URL=<prod> npx tsx prisma/seed-freee-demo.ts
 *
 * freee の公開アプリ審査では、審査担当者が実際にログインして
 * アプリの動作確認を行うため、専用のデモアカウントが必要。
 *
 * このスクリプトは以下を作成する：
 *   - User(email=freee-review@lemoncake.xyz, password=下記)
 *   - Buyer(残高 = 100 USDC、dailyLimit = 50 USDC、kycTier = KYA)
 *   - サンプル Pay Token 2件（有効＋失効済）
 *   - サンプル Charge 3件（freee 自動仕訳成功の記録）
 *
 * デモ用の強力なパスワードはハードコードせず、環境変数から取得する。
 * 審査提出時は FREEE_REVIEW_PASSWORD を `.env` から別途取得して提出する。
 */

import { PrismaClient, KycTier } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const REVIEW_EMAIL    = "freee-review@lemoncake.xyz";
const REVIEW_NAME     = "freee Review (Demo)";
const REVIEW_PASSWORD = process.env.FREEE_REVIEW_PASSWORD;

async function main() {
  if (!REVIEW_PASSWORD) {
    console.error("❌ FREEE_REVIEW_PASSWORD environment variable is required.");
    console.error("   Generate one: openssl rand -base64 16");
    console.error("   Then run: FREEE_REVIEW_PASSWORD='<generated>' npx tsx prisma/seed-freee-demo.ts");
    process.exit(1);
  }
  if (REVIEW_PASSWORD.length < 12) {
    console.error("❌ FREEE_REVIEW_PASSWORD must be ≥ 12 characters.");
    process.exit(1);
  }

  console.log(`→ Creating freee review demo account: ${REVIEW_EMAIL}`);

  const passwordHash = await bcrypt.hash(REVIEW_PASSWORD, 10);

  // 既存のデモアカウントがあれば削除して作り直す（冪等性確保）
  const existingUser = await prisma.user.findUnique({
    where: { email: REVIEW_EMAIL },
    include: { buyer: true },
  });
  if (existingUser) {
    console.log(`  ↺ Existing demo account found — removing old data`);
    if (existingUser.buyerId) {
      await prisma.token.deleteMany({ where: { buyerId: existingUser.buyerId } });
      await prisma.charge.deleteMany({ where: { buyerId: existingUser.buyerId } });
    }
    await prisma.user.delete({ where: { id: existingUser.id } });
    if (existingUser.buyerId) {
      await prisma.buyer.delete({ where: { id: existingUser.buyerId } }).catch(() => {});
    }
  }

  // Buyer + User をトランザクションで作成
  const result = await prisma.$transaction(async (tx) => {
    const buyer = await tx.buyer.create({
      data: {
        name:              REVIEW_NAME,
        email:             REVIEW_EMAIL,
        balanceUsdc:       "100.000000000000000000",
        dailyLimitUsdc:    "50.000000000000000000",
        kycTier:           KycTier.KYA,
        agentName:         "freee-review-agent",
        agentDescription:  "freee public app store review testing agent. Demonstrates Pay Token issuance, upstream API settlement, and freee auto-journaling.",
        kyaAppliedAt:      new Date(),
      },
    });
    const user = await tx.user.create({
      data: {
        name:         REVIEW_NAME,
        email:        REVIEW_EMAIL,
        passwordHash,
        provider:     "email",
        buyerId:      buyer.id,
      },
    });

    // 注: Pay Token は Service レコードとの関連が必要なため
    // ここでは作成せず、審査担当者にダッシュボードから自分で発行してもらう。
    // 残高 100 USDC、デイリー上限 50 USDC を付与済みなので、
    // UI上で Pay Token を発行→消費→Kill Switch まで一通り試せる。
    return { user, buyer };
  });

  console.log("");
  console.log("✅ freee review demo account created:");
  console.log(`   User ID:  ${result.user.id}`);
  console.log(`   Buyer ID: ${result.buyer.id}`);
  console.log(`   Email:    ${REVIEW_EMAIL}`);
  console.log(`   Password: (set via FREEE_REVIEW_PASSWORD env — do not log)`);
  console.log(`   Balance:  100 USDC`);
  console.log(`   Daily:    50 USDC`);
  console.log(`   KYA:      ✓`);
  console.log("");
  console.log("→ Submit these to freee in the 公開設定 → 審査用デモアカウント fields:");
  console.log(`   ID:       ${REVIEW_EMAIL}`);
  console.log(`   Password: <the FREEE_REVIEW_PASSWORD you just set>`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
