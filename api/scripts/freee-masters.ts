/**
 * freee マスタ取得 — account_items と taxes の ID を JSON で出力
 *
 *   npx tsx scripts/freee-masters.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

import { refreshAndPersistFreeeToken } from "../src/lib/freee.js";

const BASE       = "https://api.freee.co.jp";
let   TOKEN      = process.env.FREEE_ACCESS_TOKEN ?? "";
const COMPANY_ID = process.env.FREEE_COMPANY_ID;

async function get(path: string): Promise<unknown> {
  let res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (res.status === 401) {
    TOKEN = await refreshAndPersistFreeeToken();
    res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  }
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  const items = await get(`/api/1/account_items?company_id=${COMPANY_ID}`) as {
    account_items: { id: number; name: string; shortcut?: string; default_tax_code?: number }[];
  };
  const wanted = ["外注費", "預り金", "普通預金", "通信費", "現金", "預金"];
  console.log("━━━ account_items (relevant) ━━━");
  for (const w of wanted) {
    const hits = items.account_items.filter(i => i.name.includes(w));
    for (const h of hits) console.log(`  ${h.id.toString().padStart(6)}  ${h.name}  (default_tax_code=${h.default_tax_code})`);
  }

  const taxes = await get(`/api/1/taxes/codes`) as {
    taxes: { code: number; name_ja: string }[];
  };
  console.log("\n━━━ tax codes ━━━");
  for (const t of taxes.taxes) console.log(`  ${t.code.toString().padStart(3)}  ${t.name_ja}`);

  const banks = await get(`/api/1/walletables?company_id=${COMPANY_ID}`) as {
    walletables: { id: number; name: string; type: string }[];
  };
  console.log("\n━━━ walletables (bank accounts) ━━━");
  for (const b of banks.walletables) console.log(`  ${b.id}  [${b.type}]  ${b.name}`);
})().catch(e => { console.error(e); process.exit(1); });
