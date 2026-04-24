/**
 * freee 認可コード → トークン交換
 *   npx tsx scripts/freee-exchange.ts <CODE>
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const code = process.argv[2];
if (!code) { console.error("Usage: tsx scripts/freee-exchange.ts <CODE>"); process.exit(1); }

(async () => {
const res = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type:    "authorization_code",
    client_id:     process.env.FREEE_CLIENT_ID!,
    client_secret: process.env.FREEE_CLIENT_SECRET!,
    redirect_uri:  process.env.FREEE_REDIRECT_URI!,
    code,
  }).toString(),
});
const body = await res.text();
if (!res.ok) { console.error("FAIL:", res.status, body); process.exit(1); }
const t = JSON.parse(body) as { access_token: string; refresh_token: string };
console.log("ACCESS_TOKEN =", t.access_token);
console.log("REFRESH_TOKEN =", t.refresh_token);

// .env 更新
const envPath = resolve(process.cwd(), ".env");
let env = readFileSync(envPath, "utf8");
env = env
  .replace(/^FREEE_ACCESS_TOKEN=.*/m,  `FREEE_ACCESS_TOKEN="${t.access_token}"`)
  .replace(/^FREEE_REFRESH_TOKEN=.*/m, `FREEE_REFRESH_TOKEN="${t.refresh_token}"`);
writeFileSync(envPath, env);
console.log("[.env updated]");
})().catch(e => { console.error(e); process.exit(1); });
