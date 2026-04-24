/**
 * freee E2E Test
 *
 *   npm run -w api tsx scripts/test-freee.ts
 *
 * 1. /companies を叩いて access_token が有効か確認（無効なら refresh）
 * 2. createFreeeTransaction で源泉徴収あり／なし両パターンのダミー仕訳を作成
 * 3. 作成された deal の URL をコンソール出力
 *
 * 本番 freee 環境に test データを書き込むので注意。作成後は freee 画面で手動削除可。
 */

import { readFileSync } from "fs";
import { resolve } from "path";
// .env を手書きロード（dotenv を import しない）
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
import { createFreeeTransaction, refreshAndPersistFreeeToken } from "../src/lib/freee.js";

const FREEE_API_BASE = "https://api.freee.co.jp";

async function pingCompanies(): Promise<string> {
  let token = process.env.FREEE_ACCESS_TOKEN ?? "";
  let res = await fetch(`${FREEE_API_BASE}/api/1/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    console.log("[test] 401 — refreshing token...");
    token = await refreshAndPersistFreeeToken();
    res = await fetch(`${FREEE_API_BASE}/api/1/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!res.ok) throw new Error(`GET /companies failed: ${res.status} ${await res.text()}`);
  const body = await res.json() as { companies: { id: number; display_name: string }[] };
  console.log("[test] companies:", body.companies.map(c => `${c.id}: ${c.display_name}`).join(", "));
  return token;
}

async function main(): Promise<void> {
  console.log("━━━ freee E2E test ━━━");
  console.log(`FREEE_CLIENT_ID:  ${process.env.FREEE_CLIENT_ID?.slice(0, 8)}...`);
  console.log(`FREEE_COMPANY_ID: ${process.env.FREEE_COMPANY_ID}`);
  console.log("");

  // ─── Step 1: 認証確認 ────────────────────────────
  console.log("[1] Verify access token via GET /companies");
  await pingCompanies();
  console.log("    ✓ token valid");
  console.log("");

  const today = new Date().toISOString().slice(0, 10);

  // ─── Step 2: 源泉徴収なしパターン ────────────────
  console.log("[2] Create test deal WITHOUT withholding tax");
  const deal1 = await createFreeeTransaction({
    issueDate:         today,
    description:       "KYAPay E2E test (no withholding)",
    amountUsdc:        "1.000000",
    amountJpy:         150,
    providerName:      "Test Service Provider",
    invoiceRegistered: true,
  });
  console.log(`    ✓ deal created: ${deal1.url}`);
  console.log("");

  // ─── Step 3: 源泉徴収ありパターン ────────────────
  console.log("[3] Create test deal WITH withholding tax");
  const gross = 10000;
  const tax   = Math.floor(gross * 0.1021);  // 10.21%
  const net   = gross - tax;
  const deal2 = await createFreeeTransaction({
    issueDate:         today,
    description:       "KYAPay E2E test (with withholding)",
    amountUsdc:        "66.666666",
    amountJpy:         gross,
    providerName:      "Test Freelancer",
    invoiceRegistered: false,
    withholding: {
      required:     true,
      taxAmount:    tax,
      netAmount:    net,
      evidenceHash: "a".repeat(64),
    },
  });
  console.log(`    ✓ deal created: ${deal2.url}`);
  console.log("");

  console.log("━━━ Success ━━━");
  console.log("freee 画面で以下を確認してください:");
  console.log(`  - ${deal1.url}`);
  console.log(`  - ${deal2.url}`);
}

main().catch((err) => {
  console.error("\n✗ TEST FAILED");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
