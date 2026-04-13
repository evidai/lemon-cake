/**
 * JPYC Payment Layer
 *
 * JPYC (Japanese Yen Coin) is a JPY-pegged ERC-20 stablecoin deployed on
 * Ethereum and Polygon. This module provides the infrastructure for
 * agent-to-agent JPYC transfers, targeting the Japanese market.
 *
 * Contract addresses:
 *   Polygon mainnet (chainId 137): 0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF6
 *   Mumbai testnet  (chainId 80001): to be confirmed
 *
 * Architecture:
 *   - Uses ethers.js v6 for on-chain interaction
 *   - Stores tx records in JPYCTransaction table
 *   - Integrates with the fraud detection engine (same risk assessment)
 *   - JPYC rate oracle: fetches JPY/JPYC rate from a price feed (CoinGecko fallback)
 *
 * Regulatory note (Japan PSA):
 *   JPYC is classified as a "prepaid payment instrument" under Japan's
 *   Payment Services Act (資金決済法). AI agent payments using JPYC must
 *   comply with issuer terms. KYC requirements apply above ¥1,000,000/year.
 *
 * TODO (production):
 *   - Replace mock signer with HSM/KMS-backed key management
 *   - Integrate Chainlink JPY price feed for accurate fiat conversion
 *   - Add EIP-712 permit() for gasless transfers
 *   - Submit to Skyfire MCP server as a currency plugin
 */

import prisma from "./prisma";

// ─── Constants ────────────────────────────────────────────────────────────────

export const JPYC_CONTRACTS: Record<number, string> = {
  137: "0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF6", // Polygon mainnet
  80001: "0x0000000000000000000000000000000000000000",  // Mumbai testnet (placeholder)
  1: "0x2370f9d504c7a6E775bf6E14B3F12846b594cD53",     // Ethereum mainnet
};

// Minimal ERC-20 ABI (transfer + balanceOf + decimals)
export const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const JPYC_DECIMALS = 18;
const JPYC_UNIT = BigInt(10) ** BigInt(JPYC_DECIMALS);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a human-readable JPYC amount to on-chain units (uint256). */
export function toJPYCUnits(amount: number): bigint {
  // Use integer arithmetic to avoid floating point issues
  const wholePart = Math.floor(amount);
  const fracPart = Math.round((amount - wholePart) * 1e6); // 6 decimal places precision
  return BigInt(wholePart) * JPYC_UNIT + (BigInt(fracPart) * JPYC_UNIT) / BigInt(1e6);
}

/** Convert on-chain JPYC units back to human-readable float. */
export function fromJPYCUnits(units: bigint): number {
  const whole = Number(units / JPYC_UNIT);
  const frac = Number(units % JPYC_UNIT) / Number(JPYC_UNIT);
  return whole + frac;
}

// ─── Rate Oracle ──────────────────────────────────────────────────────────────

/**
 * Fetch the current JPYC/JPY rate.
 * JPYC is a 1:1 JPY-pegged stablecoin, so the rate is nominally 1.0.
 * In practice, secondary market rate may deviate slightly.
 *
 * Returns the number of JPY per 1 JPYC token.
 */
export async function getJPYCRate(): Promise<number> {
  // JPYC is 1:1 JPY pegged by design.
  // In production, query CoinGecko or a Chainlink price feed for market rate.
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=jpyc&vs_currencies=jpy",
      { signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const data = (await res.json()) as { jpyc?: { jpy?: number } };
      const rate = data?.jpyc?.jpy;
      if (typeof rate === "number" && rate > 0) return rate;
    }
  } catch {
    // Fallback to par value
  }
  return 1.0; // 1 JPYC = 1 JPY (par value fallback)
}

// ─── Transfer (simulation layer) ─────────────────────────────────────────────

export interface JPYCTransferParams {
  fromAddress: string;
  toAddress: string;
  amountJPYC: number;
  chainId?: number;
  /** Private key of the sender (dev only — use KMS in production). */
  senderPrivateKey?: string;
}

export interface JPYCTransferResult {
  txHash: string;
  amountJPYC: number;
  amountJPY: number;
  chainId: number;
  status: "confirmed" | "failed";
  dbId: string;
}

/**
 * Execute a JPYC ERC-20 transfer.
 *
 * In production this function would:
 *   1. Connect to Polygon RPC via ethers.js v6
 *   2. Load the JPYC contract at JPYC_CONTRACTS[chainId]
 *   3. Call contract.transfer(toAddress, toJPYCUnits(amountJPYC))
 *   4. Wait for confirmation
 *
 * Currently simulates the transfer and records it in the database.
 * To enable real on-chain transfers, install ethers: npm install ethers
 * and uncomment the ethers section below.
 */
export async function transferJPYC(params: JPYCTransferParams): Promise<JPYCTransferResult> {
  const chainId = params.chainId ?? 137;
  const jpyRate = await getJPYCRate();
  const amountJPY = params.amountJPYC * jpyRate;

  // Create a pending DB record
  const record = await prisma.jPYCTransaction.create({
    data: {
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      amountJPYC: params.amountJPYC,
      amountJPY,
      chainId,
      status: "pending",
    },
  });

  /* ── PRODUCTION: uncomment and install ethers ──────────────────────────────
  import { ethers } from "ethers";

  const rpcUrl = chainId === 137
    ? process.env.POLYGON_RPC_URL ?? "https://polygon-rpc.com"
    : process.env.MUMBAI_RPC_URL ?? "https://rpc-mumbai.maticvigil.com";

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(params.senderPrivateKey!, provider);
  const contractAddress = JPYC_CONTRACTS[chainId];
  const contract = new ethers.Contract(contractAddress, ERC20_ABI, signer);

  const tx = await contract.transfer(params.toAddress, toJPYCUnits(params.amountJPYC));
  const receipt = await tx.wait();
  const txHash = receipt.hash;
  ─────────────────────────────────────────────────────────────────────────── */

  // Simulation: generate a mock tx hash
  const mockTxHash = `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("")}`;

  const updated = await prisma.jPYCTransaction.update({
    where: { id: record.id },
    data: { txHash: mockTxHash, status: "confirmed" },
  });

  return {
    txHash: mockTxHash,
    amountJPYC: params.amountJPYC,
    amountJPY,
    chainId,
    status: "confirmed",
    dbId: updated.id,
  };
}

// ─── Balance check (simulation) ───────────────────────────────────────────────

/**
 * Get an agent's JPYC balance.
 * In production: call contract.balanceOf(ethAddress) on Polygon.
 */
export async function getJPYCBalance(
  ethAddress: string,
  chainId = 137
): Promise<{ address: string; balance: number; chainId: number }> {
  /* ── PRODUCTION ────────────────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(JPYC_CONTRACTS[chainId], ERC20_ABI, provider);
  const raw = await contract.balanceOf(ethAddress);
  return { address: ethAddress, balance: fromJPYCUnits(raw), chainId };
  ─────────────────────────────────────────────────────────────────────────── */

  // Simulation: derive a mock balance from DB history
  const [sent, received] = await Promise.all([
    prisma.jPYCTransaction.findMany({
      where: { fromAddress: ethAddress, status: "confirmed" },
      select: { amountJPYC: true },
    }),
    prisma.jPYCTransaction.findMany({
      where: { toAddress: ethAddress, status: "confirmed" },
      select: { amountJPYC: true },
    }),
  ]);

  const totalSent = sent.reduce((s, t) => s + t.amountJPYC, 0);
  const totalReceived = received.reduce((s, t) => s + t.amountJPYC, 0);
  const balance = Math.max(0, 100_000 + totalReceived - totalSent); // start with ¥100,000

  return { address: ethAddress, balance, chainId };
}
