/**
 * Polygon USDC 送金ロジック (viem)
 *
 * USDC (ERC-20) をホットウォレットからプロバイダーウォレットへ送金する。
 *
 * 前提:
 * - POLYGON_RPC_URL    : Alchemy/Infura 等の Polygon Mainnet RPC
 * - HOT_WALLET_PRIVATE_KEY : ホットウォレットの秘密鍵 (0x...)
 * - USDC_CONTRACT_ADDRESS  : Polygon Mainnet USDC = 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
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

// ─── USDC ERC-20 最小ABI（transfer のみ）────────────────────
const USDC_ABI = [
  {
    name:    "transfer",
    type:    "function",
    stateMutability: "nonpayable",
    inputs:  [
      { name: "to",     type: "address" },
      { name: "value",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name:    "balanceOf",
    type:    "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ─── 環境変数から設定を取得 ──────────────────────────────────
function getConfig() {
  const rpcUrl = process.env.POLYGON_RPC_URL;
  const privateKey = process.env.HOT_WALLET_PRIVATE_KEY as Hex | undefined;
  const contractAddress = (
    process.env.USDC_CONTRACT_ADDRESS ??
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
  ) as Address;

  if (!rpcUrl)    throw new Error("POLYGON_RPC_URL is not set");
  if (!privateKey) throw new Error("HOT_WALLET_PRIVATE_KEY is not set");

  return { rpcUrl, privateKey, contractAddress };
}

// ─── USDC decimals (Polygon USDC = 6) ────────────────────────
const USDC_DECIMALS = 6;

// ─── メイン: USDC送金 ─────────────────────────────────────────
export interface SendUsdcParams {
  toAddress:  string;  // プロバイダーのウォレットアドレス
  amountUsdc: string;  // 送金額（例: "0.005000"）
}

export interface SendUsdcResult {
  txHash: string;
}

export async function sendUsdcOnPolygon(
  params: SendUsdcParams,
): Promise<SendUsdcResult> {
  const { rpcUrl, privateKey, contractAddress } = getConfig();

  const account = privateKeyToAccount(privateKey);
  const toAddress = getAddress(params.toAddress) as Address;

  // viem: publicClient (読み取り) & walletClient (送信)
  const publicClient = createPublicClient({
    chain:     polygon,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain:     polygon,
    transport: http(rpcUrl),
  });

  // 送金額を uint256 (6 decimals) に変換
  const amountRaw = parseUnits(params.amountUsdc, USDC_DECIMALS);

  // ERC-20 transfer 呼び出し
  const txHash = await walletClient.writeContract({
    address:      contractAddress,
    abi:          USDC_ABI,
    functionName: "transfer",
    args:         [toAddress, amountRaw],
  });

  // トランザクション確定を待機（1 confirmation）
  await publicClient.waitForTransactionReceipt({
    hash:               txHash,
    confirmations:      1,
    pollingInterval:    2_000,   // 2秒ポーリング
    timeout:            120_000, // 2分タイムアウト
  });

  return { txHash };
}

// ─── ホットウォレットの USDC 残高確認（監視用）──────────────
export async function getHotWalletUsdcBalance(): Promise<bigint> {
  const { rpcUrl, privateKey, contractAddress } = getConfig();
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain:     polygon,
    transport: http(rpcUrl),
  });

  return publicClient.readContract({
    address:      contractAddress,
    abi:          USDC_ABI,
    functionName: "balanceOf",
    args:         [account.address],
  }) as Promise<bigint>;
}
