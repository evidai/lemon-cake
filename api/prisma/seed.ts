/**
 * サービスレジストリ シードスクリプト
 *
 * 実行: npx tsx prisma/seed.ts
 *
 * LEMON cake プラットフォームプロバイダーと
 * 高需要 AI サービス群をデータベースに登録する。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLATFORM_WALLET = process.env.JPYC_PLATFORM_WALLET
  ?? "0x0000000000000000000000000000000000000000";

// ─── サービス定義 ──────────────────────────────────────────────
const SERVICES: Array<{
  name:             string;
  type:             "API" | "MCP";
  pricePerCallUsdc: string;
  endpoint?:        string;
  authHeader?:      string;
}> = [
  // ── 🇯🇵 日本向け有料サービス（プロキシ経由） ──────────────────
  {
    name:             "freee 会計 API",
    type:             "API",
    pricePerCallUsdc: "0.001000",
    endpoint:         "https://api.freee.co.jp/api/1",
    authHeader:       process.env.FREEE_ACCESS_TOKEN
                        ? `Bearer ${process.env.FREEE_ACCESS_TOKEN}`
                        : undefined,
  },
  {
    name:             "国税庁 インボイス照合 API",
    type:             "API",
    pricePerCallUsdc: "0.000500",
    // NTA Web-API: ?id=<アプリID> をクエリパラメータで付与して呼ぶ
    // エージェントは /api/proxy/<serviceId>/sealed/v01/matching?id=<appId>&number=T... の形で呼ぶ
    endpoint:         "https://web-api.invoice-kohyo.nta.go.jp/api/1",
    authHeader:       undefined,
  },
  // ── 検索・Web ──────────────────────────────────────────────
  {
    name:             "Tavily Search",
    type:             "API",
    pricePerCallUsdc: "0.000100",
  },
  {
    name:             "Firecrawl — Web Scraping",
    type:             "API",
    pricePerCallUsdc: "0.000200",
  },
  {
    name:             "Exa Search",
    type:             "API",
    pricePerCallUsdc: "0.000100",
  },
  {
    name:             "Serper — Google Search",
    type:             "API",
    pricePerCallUsdc: "0.000050",
  },
  // ── コード実行・ブラウザ ────────────────────────────────────
  {
    name:             "E2B — Code Interpreter",
    type:             "API",
    pricePerCallUsdc: "0.000500",
  },
  {
    name:             "Browserbase — Browser Automation",
    type:             "API",
    pricePerCallUsdc: "0.001000",
  },
  {
    name:             "Apify — Web Automation",
    type:             "API",
    pricePerCallUsdc: "0.002000",
  },
  // ── AI モデル推論 ──────────────────────────────────────────
  {
    name:             "Replicate — Image Generation",
    type:             "API",
    pricePerCallUsdc: "0.005000",
  },
  {
    name:             "fal.ai — Fast AI Inference",
    type:             "API",
    pricePerCallUsdc: "0.003000",
  },
  // ── 音声・メディア ─────────────────────────────────────────
  {
    name:             "ElevenLabs — Text to Speech",
    type:             "API",
    pricePerCallUsdc: "0.002000",
  },
  {
    name:             "AssemblyAI — Speech to Text",
    type:             "API",
    pricePerCallUsdc: "0.001000",
  },
  {
    name:             "Deepgram — Real-time STT",
    type:             "API",
    pricePerCallUsdc: "0.000500",
  },
  // ── テキスト処理 ───────────────────────────────────────────
  {
    name:             "DeepL — Translation",
    type:             "API",
    pricePerCallUsdc: "0.000100",
  },
  {
    name:             "Mathpix — PDF & Math OCR",
    type:             "API",
    pricePerCallUsdc: "0.003000",
  },
  // ── データ・金融 ───────────────────────────────────────────
  {
    name:             "Polygon.io — Market Data",
    type:             "API",
    pricePerCallUsdc: "0.000050",
  },
  {
    name:             "Resend — Email Sending",
    type:             "API",
    pricePerCallUsdc: "0.000010",
  },
  // ── MCP サービス ───────────────────────────────────────────
  {
    name:             "Firecrawl MCP",
    type:             "MCP",
    pricePerCallUsdc: "0.000300",
  },
  {
    name:             "Tavily MCP",
    type:             "MCP",
    pricePerCallUsdc: "0.000150",
  },
];

async function main() {
  console.log("🌱 Seeding service registry...\n");

  // ─── プラットフォームプロバイダーの upsert ──────────────────
  const platform = await prisma.provider.upsert({
    where:  { email: "platform@aievid.com" },
    update: { name: "LEMON cake Platform", walletAddress: PLATFORM_WALLET },
    create: {
      name:          "LEMON cake Platform",
      email:         "platform@aievid.com",
      walletAddress: PLATFORM_WALLET,
      active:        true,
    },
  });
  console.log(`✅ Provider: ${platform.name} (${platform.id})`);

  // ─── サービス登録 ──────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const svc of SERVICES) {
    const existing = await prisma.service.findFirst({
      where: { name: svc.name, providerId: platform.id },
    });

    const data = {
      providerId:       platform.id,
      name:             svc.name,
      type:             svc.type,
      pricePerCallUsdc: svc.pricePerCallUsdc,
      endpoint:         svc.endpoint   ?? null,
      // authHeader は undefined の場合は既存値を保持、明示的に値がある場合のみ上書き
      ...(svc.authHeader !== undefined ? { authHeader: svc.authHeader } : {}),
      reviewStatus:     "APPROVED" as const,
      verified:         true,
    };

    if (existing) {
      // 既存レコードは authHeader / endpoint を更新（再シードで反映できるように）
      await prisma.service.update({
        where: { id: existing.id },
        data: {
          endpoint:   data.endpoint,
          ...(svc.authHeader !== undefined ? { authHeader: svc.authHeader } : {}),
        },
      });
      console.log(`  🔄 ${svc.type.padEnd(3)} | ${svc.name.padEnd(40)} | updated`);
      skipped++;
      continue;
    }

    await prisma.service.create({ data });
    console.log(`  ➕ ${svc.type.padEnd(3)} | ${svc.name.padEnd(40)} | $${svc.pricePerCallUsdc}/call`);
    created++;
  }

  console.log(`\n✅ Done: ${created} created, ${skipped} skipped`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
