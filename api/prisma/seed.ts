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
  // ── 🇯🇵 政府系データ API ───────────────────────────────────────
  {
    name:             "gBizINFO 法人情報 API",
    type:             "API",
    pricePerCallUsdc: "0.000500",
    endpoint:         "https://info.gbiz.go.jp/api/ene/v1",
    // X-hojin-info-api-key ヘッダー形式: "X-hojin-info-api-key:<key>"
    authHeader:       process.env.GBIZINFO_API_KEY
                        ? `X-hojin-info-api-key:${process.env.GBIZINFO_API_KEY}`
                        : undefined,
  },
  {
    name:             "e-Gov 法令検索 API",
    type:             "API",
    pricePerCallUsdc: "0.000300",
    endpoint:         "https://laws.e-gov.go.jp/api/1",
    authHeader:       undefined, // 認証不要（完全オープン）
  },
  // ── 🌍 グローバル・コンプライアンス API ───────────────────────
  {
    name:             "Abstract API — VAT Validation",
    type:             "API",
    pricePerCallUsdc: "0.000200",
    endpoint:         "https://vat.abstractapi.com/v1",
    authHeader:       process.env.ABSTRACT_API_KEY
                        ? `QUERY:api_key:${process.env.ABSTRACT_API_KEY}`
                        : undefined,
  },
  {
    name:             "IPinfo — IP Geolocation & Risk",
    type:             "API",
    pricePerCallUsdc: "0.000100",
    endpoint:         "https://ipinfo.io",
    authHeader:       process.env.IPINFO_TOKEN
                        ? `Bearer ${process.env.IPINFO_TOKEN}`
                        : undefined,
  },
  {
    name:             "Open Exchange Rates — 為替レート",
    type:             "API",
    pricePerCallUsdc: "0.000200",
    endpoint:         "https://openexchangerates.org/api",
    authHeader:       process.env.OPENEXCHANGERATES_APP_ID
                        ? `QUERY:app_id:${process.env.OPENEXCHANGERATES_APP_ID}`
                        : undefined,
  },
  {
    name:             "Hunter.io — 企業メール・連絡先検索",
    type:             "API",
    pricePerCallUsdc: "0.000500",
    endpoint:         "https://api.hunter.io/v2",
    authHeader:       process.env.HUNTER_API_KEY
                        ? `QUERY:api_key:${process.env.HUNTER_API_KEY}`
                        : undefined,
  },
  // ── 🕷️ LLMネイティブ・スクレイパー ───────────────────────────
  {
    name:             "Firecrawl — Web Scraping",
    type:             "API",
    pricePerCallUsdc: "0.000200",
    endpoint:         "https://api.firecrawl.dev/v1",
    authHeader:       process.env.FIRECRAWL_API_KEY
                        ? `Bearer ${process.env.FIRECRAWL_API_KEY}`
                        : undefined,
  },
  {
    name:             "Jina Reader — LLM Web Reader",
    type:             "API",
    pricePerCallUsdc: "0.000100",
    // エージェントは /api/proxy/<id>/https://example.com の形で呼ぶ
    // → https://r.jina.ai/https://example.com に転送
    endpoint:         "https://r.jina.ai",
    authHeader:       process.env.JINA_API_KEY
                        ? `Bearer ${process.env.JINA_API_KEY}`
                        : undefined,
  },
  // ── 検索・Web ──────────────────────────────────────────────
  {
    name:             "Tavily Search",
    type:             "API",
    pricePerCallUsdc: "0.000100",
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
    endpoint:         "https://api.firecrawl.dev/v1",
    authHeader:       process.env.FIRECRAWL_API_KEY
                        ? `Bearer ${process.env.FIRECRAWL_API_KEY}`
                        : undefined,
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
