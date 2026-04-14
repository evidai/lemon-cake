/**
 * JPYC オンチェーン TX 検証 (viem / Polygon)
 *
 * TXハッシュからJPYC ERC-20 Transferイベントを読み取り、
 * - 送金先がプラットフォームウォレットか
 * - 送金量が申請額と一致するか（±1%の誤差許容）
 * を自動検証する。
 *
 * JPYC (Polygon): 0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF9
 * decimals: 18
 */

import {
  createPublicClient,
  http,
  parseAbiItem,
  decodeEventLog,
  getAddress,
  type Hex,
  type Address,
} from "viem";
import { polygon } from "viem/chains";

// JPYC コントラクト (Polygon Mainnet)
const JPYC_CONTRACT = "0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF9" as Address;
const JPYC_DECIMALS = 18;

// ERC-20 Transfer イベント ABI
const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export interface JpycVerifyResult {
  valid:       boolean;
  actualJpyc:  string;   // 実際の送金量（JPYC, 小数点あり）
  error?:      string;
}

/**
 * TXハッシュを検証してJPYC Transferを確認する
 * @param txHash  - 0xから始まるトランザクションハッシュ
 * @param toWallet - プラットフォーム受け取りウォレット
 * @param expectedJpyc - ユーザーが申告したJPYC量（文字列）
 */
export async function verifyJpycTransfer(
  txHash: string,
  toWallet: string,
  expectedJpyc: string,
): Promise<JpycVerifyResult> {
  const rpcUrl = process.env.POLYGON_RPC_URL;
  if (!rpcUrl) {
    return { valid: false, actualJpyc: "0", error: "POLYGON_RPC_URL not configured" };
  }

  const publicClient = createPublicClient({
    chain:     polygon,
    transport: http(rpcUrl),
  });

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  } catch {
    return { valid: false, actualJpyc: "0", error: "トランザクションが見つかりません（まだ確定していない可能性があります）" };
  }

  // TX失敗チェック
  if (receipt.status !== "success") {
    return { valid: false, actualJpyc: "0", error: "トランザクションは失敗しています" };
  }

  // JPYC コントラクトのTransferイベントを探す
  const platformAddress = getAddress(toWallet);
  let transferAmount: bigint | null = null;

  for (const log of receipt.logs) {
    // JPYCコントラクトのログのみ対象
    if (getAddress(log.address) !== getAddress(JPYC_CONTRACT)) continue;

    try {
      const decoded = decodeEventLog({
        abi:    [TRANSFER_EVENT],
        data:   log.data,
        topics: log.topics as [Hex, ...Hex[]],
      }) as { eventName: string; args: { from: Address; to: Address; value: bigint } };
      if (decoded.eventName !== "Transfer") continue;

      const { to, value } = decoded.args;

      // 受け取りアドレスがプラットフォームウォレットか確認
      if (getAddress(to) === platformAddress) {
        transferAmount = value;
        break;
      }
    } catch {
      continue;
    }
  }

  if (transferAmount === null) {
    return {
      valid:       false,
      actualJpyc:  "0",
      error:       `プラットフォームウォレット(${toWallet})へのJPYC送金が確認できません`,
    };
  }

  // 実際の送金量 (JPYC, 18 decimals → 通常の数値)
  const actualJpyc = (Number(transferAmount) / 10 ** JPYC_DECIMALS).toFixed(6);

  // 申告量との比較（±1% の誤差許容）
  const expected = parseFloat(expectedJpyc);
  const actual   = parseFloat(actualJpyc);
  const tolerance = expected * 0.01;

  if (Math.abs(actual - expected) > tolerance) {
    return {
      valid:      false,
      actualJpyc,
      error: `申告量(${expected} JPYC)と実際の送金量(${actualJpyc} JPYC)が一致しません`,
    };
  }

  return { valid: true, actualJpyc };
}

/**
 * リアルタイム JPYC/USDC レートを取得（CoinGecko）
 * JPYC ≈ 1 JPY なので JPY/USD レートを使用
 */
export async function fetchJpycRate(): Promise<number> {
  try {
    // CoinGecko: USD-Coin の JPY 建て価格 = 1 USDC = X JPY = X JPYC
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=jpy",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error("CoinGecko API error");
    const data = await res.json() as { "usd-coin": { jpy: number } };
    const rate = data["usd-coin"]?.jpy;
    if (!rate || rate < 100 || rate > 300) throw new Error("Invalid rate");
    return Math.round(rate * 10) / 10; // 小数点1桁に丸める
  } catch {
    // フォールバック: 環境変数の設定値
    return parseFloat(process.env.JPYC_RATE ?? "150");
  }
}
