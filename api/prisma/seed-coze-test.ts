/**
 * Coze plugin audit test data seeder.
 *
 * 実行: cd api && npx tsx prisma/seed-coze-test.ts
 *
 * - test-service という ID の APPROVED サービスを作成
 * - Coze 用テスト buyer (cmo6krzbq0001q5y9esq60i2d) に balance 10 USDC 付与
 *
 * これで Coze の issue_pay_token テスト実行で 200 が返るようになる。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_BUYER_ID = "cmo6krzbq0001q5y9esq60i2d";
const TEST_SERVICE_ID = "test-service";
const TEST_PROVIDER_ID = "test-provider-coze";

async function main() {
  // 1. テスト用 Provider 作成 (無ければ)
  const provider = await prisma.provider.upsert({
    where: { id: TEST_PROVIDER_ID },
    update: {},
    create: {
      id: TEST_PROVIDER_ID,
      name: "Coze Test Provider",
      email: "coze-test-provider@aievid.com",
      walletAddress: "0x000000000000000000000000000000000000c0ze",
      active: true,
    },
  });
  console.log("✅ Provider:", provider.id);

  // 2. test-service 作成 (APPROVED)
  const service = await prisma.service.upsert({
    where: { id: TEST_SERVICE_ID },
    update: {
      reviewStatus: "APPROVED",
      verified: true,
    },
    create: {
      id: TEST_SERVICE_ID,
      providerId: provider.id,
      name: "Coze Plugin Test Service",
      type: "API",
      pricePerCallUsdc: "0.005",
      // テスト用 echo エンドポイント (httpbin) — 任意の path/method に 200 で応答
      endpoint: "https://httpbin.org/anything",
      reviewStatus: "APPROVED",
      verified: true,
    },
  });
  console.log("✅ Service:", service.id, "status:", service.reviewStatus);

  // 3. テスト buyer に balance 付与
  const buyer = await prisma.buyer.update({
    where: { id: TEST_BUYER_ID },
    data: {
      balanceUsdc: "10",
      dailyLimitUsdc: "100",
    },
  });
  console.log("✅ Buyer balance:", buyer.balanceUsdc.toString(), "USDC");

  console.log("\n🎉 Done. Coze issue_pay_token should now return 200.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
