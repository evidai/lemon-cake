/**
 * Treasury Wallet & Hot Wallet 補充ロジック
 *
 * - HOT_WALLET: API 課金時に provider へ送金する作業用ウォレット
 * - TREASURY_WALLET: 運営の USDC プール。HOT_WALLET の残高が閾値を切ったら自動補充
 *
 * 環境変数:
 *   HOT_WALLET_PRIVATE_KEY        — 送金実行用 (既存)
 *   TREASURY_WALLET_PRIVATE_KEY   — 補充元
 *   HOT_WALLET_THRESHOLD_USDC     — 補充トリガー閾値 (default: "10")
 *   HOT_WALLET_REFILL_AMOUNT_USDC — 1回の補充額 (default: "100")
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { prisma } from "./prisma.js";
import { Decimal } from "@prisma/client/runtime/library";

const USDC_DECIMALS = 6;

const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",    type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function normalizeKey(raw: string): Hex {
  return ("0x" + raw.replace(/^0x/, "")) as Hex;
}

function getConfig() {
  const rpcUrl = process.env.POLYGON_RPC_URL;
  if (!rpcUrl) throw new Error("POLYGON_RPC_URL is not set");

  const contractAddress = (
    process.env.USDC_CONTRACT_ADDRESS ??
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
  ) as Address;

  const hotKey = process.env.HOT_WALLET_PRIVATE_KEY;
  if (!hotKey) throw new Error("HOT_WALLET_PRIVATE_KEY is not set");

  const treasuryKey = process.env.TREASURY_WALLET_PRIVATE_KEY;

  const threshold     = new Decimal(process.env.HOT_WALLET_THRESHOLD_USDC ?? "10");
  const refillAmount  = new Decimal(process.env.HOT_WALLET_REFILL_AMOUNT_USDC ?? "100");

  return { rpcUrl, contractAddress, hotKey, treasuryKey, threshold, refillAmount };
}

function publicClient(rpcUrl: string) {
  return createPublicClient({ chain: polygon, transport: http(rpcUrl) });
}

async function readUsdcBalance(rpcUrl: string, contract: Address, address: Address): Promise<Decimal> {
  const client = publicClient(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (await client.readContract({
    address: contract, abi: USDC_ABI, functionName: "balanceOf", args: [address],
  } as any)) as bigint;
  return new Decimal(raw.toString()).div(new Decimal(10).pow(USDC_DECIMALS));
}

// ─── HOT_WALLET 残高チェック + 必要なら Treasury から自動補充 ──
export async function refillHotWalletIfNeeded(): Promise<{
  refilled: boolean;
  reason?: string;
  hotBalance?: string;
  threshold?: string;
  txHash?: string;
}> {
  const { rpcUrl, contractAddress, hotKey, treasuryKey, threshold, refillAmount } = getConfig();

  const hotAccount = privateKeyToAccount(normalizeKey(hotKey));
  const hotBalance = await readUsdcBalance(rpcUrl, contractAddress, hotAccount.address);

  if (hotBalance.gte(threshold)) {
    return {
      refilled:  false,
      reason:    "above_threshold",
      hotBalance: hotBalance.toFixed(6),
      threshold:  threshold.toFixed(6),
    };
  }

  if (!treasuryKey) {
    console.warn(`[Treasury] HOT wallet low (${hotBalance.toFixed(6)} < ${threshold.toFixed(6)}) but TREASURY_WALLET_PRIVATE_KEY not configured`);
    return { refilled: false, reason: "treasury_not_configured", hotBalance: hotBalance.toFixed(6), threshold: threshold.toFixed(6) };
  }

  const treasuryAccount = privateKeyToAccount(normalizeKey(treasuryKey));
  const treasuryBalance = await readUsdcBalance(rpcUrl, contractAddress, treasuryAccount.address);

  if (treasuryBalance.lt(refillAmount)) {
    console.error(`[Treasury] Treasury balance ${treasuryBalance.toFixed(6)} < refill ${refillAmount.toFixed(6)}`);
    return { refilled: false, reason: "treasury_insufficient", hotBalance: hotBalance.toFixed(6) };
  }

  // 補充ログレコードを作成 (PENDING)
  const refill = await prisma.hotWalletRefill.create({
    data: {
      amountUsdc:         refillAmount,
      fromAddress:        treasuryAccount.address,
      toAddress:          hotAccount.address,
      thresholdUsdc:      threshold,
      triggerBalanceUsdc: hotBalance,
      status:             "PENDING",
    },
  });

  console.log(`[Treasury] 🔄 Refilling HOT wallet ${hotBalance.toFixed(6)} → +${refillAmount.toFixed(6)} USDC`);

  try {
    const treasuryClient = createWalletClient({ account: treasuryAccount, chain: polygon, transport: http(rpcUrl) });
    const amountRaw = parseUnits(refillAmount.toFixed(6), USDC_DECIMALS);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await treasuryClient.writeContract({
      address: contractAddress, abi: USDC_ABI, functionName: "transfer",
      args: [getAddress(hotAccount.address) as Address, amountRaw],
    } as any);

    await publicClient(rpcUrl).waitForTransactionReceipt({
      hash: txHash, confirmations: 1, pollingInterval: 2_000, timeout: 120_000,
    });

    await prisma.hotWalletRefill.update({
      where: { id: refill.id },
      data:  { status: "COMPLETED", txHash, completedAt: new Date() },
    });

    console.log(`[Treasury] ✅ Refilled. tx: ${txHash}`);
    return { refilled: true, hotBalance: hotBalance.toFixed(6), threshold: threshold.toFixed(6), txHash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.hotWalletRefill.update({
      where: { id: refill.id },
      data:  { status: "FAILED", failureReason: msg.slice(0, 500) },
    });
    console.error(`[Treasury] ❌ Refill failed:`, msg);
    return { refilled: false, reason: "tx_failed", hotBalance: hotBalance.toFixed(6) };
  }
}

// ─── 管理者引き出し: HOT_WALLET から任意のアドレスへ送金 ─────
export async function withdrawFromHotWallet(params: {
  toAddress:  string;
  amountUsdc: string;
}): Promise<{ txHash: string }> {
  const { rpcUrl, contractAddress, hotKey } = getConfig();

  const account     = privateKeyToAccount(normalizeKey(hotKey));
  const toAddress   = getAddress(params.toAddress) as Address;
  const amountRaw   = parseUnits(params.amountUsdc, USDC_DECIMALS);

  const client      = publicClient(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balanceRaw  = (await client.readContract({
    address: contractAddress, abi: USDC_ABI, functionName: "balanceOf", args: [account.address],
  } as any)) as bigint;

  if (balanceRaw < amountRaw) {
    throw new Error(`Hot wallet balance ${balanceRaw} < requested ${amountRaw}`);
  }

  const walletClient = createWalletClient({ account, chain: polygon, transport: http(rpcUrl) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txHash = await walletClient.writeContract({
    address: contractAddress, abi: USDC_ABI, functionName: "transfer", args: [toAddress, amountRaw],
  } as any);

  await client.waitForTransactionReceipt({
    hash: txHash, confirmations: 1, pollingInterval: 2_000, timeout: 120_000,
  });

  return { txHash };
}

// ─── ウォレット残高情報 (管理画面用) ──────────────────────────
export async function getWalletBalances(): Promise<{
  hotWallet:      { address: string; balanceUsdc: string };
  treasuryWallet: { address: string; balanceUsdc: string } | null;
  thresholdUsdc:  string;
  refillAmount:   string;
}> {
  const { rpcUrl, contractAddress, hotKey, treasuryKey, threshold, refillAmount } = getConfig();

  const hotAccount = privateKeyToAccount(normalizeKey(hotKey));
  const hotBalance = await readUsdcBalance(rpcUrl, contractAddress, hotAccount.address);

  let treasury: { address: string; balanceUsdc: string } | null = null;
  if (treasuryKey) {
    const treasuryAccount = privateKeyToAccount(normalizeKey(treasuryKey));
    const treasuryBalance = await readUsdcBalance(rpcUrl, contractAddress, treasuryAccount.address);
    treasury = { address: treasuryAccount.address, balanceUsdc: treasuryBalance.toFixed(6) };
  }

  return {
    hotWallet:     { address: hotAccount.address, balanceUsdc: hotBalance.toFixed(6) },
    treasuryWallet: treasury,
    thresholdUsdc:  threshold.toFixed(6),
    refillAmount:   refillAmount.toFixed(6),
  };
}
