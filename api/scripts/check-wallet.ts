import { getHotWalletUsdcBalance } from "../src/lib/usdc.js";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const account = privateKeyToAccount(("0x" + process.env.HOT_WALLET_PRIVATE_KEY!.replace(/^0x/, "")) as `0x${string}`);
  console.log("Hot wallet address:", account.address);
  const bal = await getHotWalletUsdcBalance();
  console.log("USDC balance:", (Number(bal) / 1_000_000).toFixed(6), "USDC");
}
main().catch(e => { console.error(e); process.exit(1); });
