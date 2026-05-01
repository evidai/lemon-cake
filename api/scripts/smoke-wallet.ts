import { SignJWT } from "jose";

async function main() {
  const secret = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET);
  const tok = await new SignJWT({ sub: "smoke-test" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("kyapay-admin")
    .setExpirationTime("5m")
    .sign(secret);
  const r = await fetch("https://api.lemoncake.xyz/api/admin/revenue/summary", { headers: { Authorization: `Bearer ${tok}` } });
  const d = await r.json();
  console.log("walletError:", d.walletError ? d.walletError.slice(0, 150) : null);
  console.log("wallet:", JSON.stringify(d.wallet, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
