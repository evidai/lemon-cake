import { PrismaClient } from "@prisma/client";

// 各サービスへの最小テストリクエスト
// (path, method, body は API 仕様に応じて。失敗したら手動で調整)
const TEST_REQUESTS: Record<string, { path: string; method: string; body?: unknown; expect200?: boolean }> = {
  "Serper — Google Search":            { path: "/search",          method: "POST", body: { q: "test", num: 1 } },
  "Hunter.io — 企業メール・連絡先検索": { path: "/domain-search?domain=anthropic.com&limit=1", method: "GET" },
  "Jina Reader — LLM Web Reader":      { path: "/?url=https://example.com", method: "GET" },
  "Open Exchange Rates — 為替レート":   { path: "/latest.json",      method: "GET" },
  "Firecrawl — Web Scraping":          { path: "/scrape",           method: "POST", body: { url: "https://example.com" } },
  "Firecrawl MCP":                     { path: "/scrape",           method: "POST", body: { url: "https://example.com" } },
  "IPinfo — IP Geolocation & Risk":    { path: "/8.8.8.8",          method: "GET" },
  "Slack — Human-in-the-loop":         { path: "/auth.test",        method: "POST" },
  "gBizINFO 法人情報 API":              { path: "/hojin/3010001088782", method: "GET" },
  "Coze Plugin Test Service":          { path: "/anything",         method: "POST", body: { test: 1 } },
  "Abstract API — VAT Validation":     { path: "/validate?vat_number=DE259597697", method: "GET" },
  "AfterShip API":                     { path: "/trackings",        method: "GET" },
  "CloudSign API":                     { path: "/documents",        method: "GET" },
  "e-Gov 法令検索 API":                 { path: "/keyword?keyword=憲法", method: "GET" },
  "Raksul API":                        { path: "/products",         method: "GET" },
  "TRUSTDOCK eKYC":                    { path: "/projects",         method: "GET" },
  "国税庁 インボイス照合 API":           { path: "/check?id=T1234567890123",   method: "GET" },
};

const PAY_TOKEN = process.env.LCT_TEST_TOKEN!; // テスト用 ALL scope token

async function main() {
  if (!PAY_TOKEN) { console.error("Set LCT_TEST_TOKEN env var"); process.exit(1); }

  const p = new PrismaClient();
  const services = await p.service.findMany({
    where: { reviewStatus: "APPROVED", verified: true },
    orderBy: { name: "asc" },
  });

  const results: Array<{ name: string; status: number | string; ok: boolean; ms: number }> = [];

  for (const s of services) {
    const test = TEST_REQUESTS[s.name];
    if (!test) {
      results.push({ name: s.name, status: "SKIP", ok: false, ms: 0 });
      continue;
    }
    const url = `https://api.lemoncake.xyz/api/proxy/${s.id}${test.path}`;
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: test.method,
        headers: {
          "Authorization": `Bearer ${PAY_TOKEN}`,
          "Content-Type":  "application/json",
        },
        ...(test.body ? { body: JSON.stringify(test.body) } : {}),
      });
      const ms = Date.now() - t0;
      const ok = res.status >= 200 && res.status < 500;  // 4xx も "サービスは生きてる" とみなす
      results.push({ name: s.name, status: res.status, ok, ms });
    } catch (e) {
      results.push({ name: s.name, status: "ERR", ok: false, ms: Date.now() - t0 });
    }
  }

  console.log("\nSmoke test results:");
  console.log("status\tms\tname");
  console.log("------\t--\t----");
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${r.status}\t${r.ms}\t${r.name}`);
  }
  const ok = results.filter(r => r.ok).length;
  console.log(`\nWorking: ${ok}/${results.length}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
