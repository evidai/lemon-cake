/**
 * KYB (Know Your Business) — 新規取引先審査モジュール
 *
 * 初回送金前に自動実行し、リスクスコアに応じて決済を承認・保留・拒否する。
 *
 * スコアリング:
 *   0–59  → APPROVED（自動承認）
 *   60–89 → REVIEW（人間エスカレーション）
 *   90+   → BLOCKED（決済保留 + 管理者通知）
 *
 * 使用 API:
 *   - gBizINFO: 法人情報照合
 *   - 国税庁: 適格請求書発行事業者確認
 *   - IPinfo:  アクセス元 IP リスク判定
 */

import { checkInvoiceRegistration } from "./tax.js";

// ─── 型定義 ───────────────────────────────────────────────────
export type KybVerdict = "APPROVED" | "REVIEW" | "BLOCKED";

export interface KybCheckResult {
  verdict:     KybVerdict;
  riskScore:   number;        // 0–100+
  breakdown:   RiskFactor[];  // スコア内訳（監査ログ用）
  details: {
    corporateNumber?:    string;
    companyName?:        string;
    established?:        string;   // YYYY-MM-DD
    capitalJpy?:         number;
    representative?:     string;
    isGbizRegistered:    boolean;
    isInvoiceQualified:  boolean;
    ipRisk?:             string;   // "low" | "medium" | "high"
  };
  escalate:    boolean;
  checkedAt:   string;
}

interface RiskFactor {
  factor:  string;
  score:   number;
  detail:  string;
}

// ─── スコアリング定数 ─────────────────────────────────────────
const SCORE = {
  GBIZ_NOT_FOUND:          40,
  ESTABLISHED_UNDER_1Y:    30,
  CAPITAL_UNDER_1M:        20,
  INVOICE_NOT_QUALIFIED:   20,
  IP_RISK_HIGH:            30,
  IP_RISK_MEDIUM:          15,
  FOREIGN_IP:              10,
} as const;

// ─── メイン KYB チェック関数 ──────────────────────────────────
export async function runKybCheck(params: {
  corporateNumber?:         string;  // 法人番号 (13桁)
  invoiceRegistrationNumber?: string;  // T + 13桁
  requesterIp?:             string;
}): Promise<KybCheckResult> {
  const breakdown: RiskFactor[] = [];
  let totalScore = 0;
  const details: KybCheckResult["details"] = {
    isGbizRegistered:   false,
    isInvoiceQualified: false,
  };

  // ── 1. gBizINFO 法人情報照合 ─────────────────────────────
  if (params.corporateNumber) {
    try {
      const gbizResult = await fetchGbizInfo(params.corporateNumber);
      if (!gbizResult) {
        totalScore += SCORE.GBIZ_NOT_FOUND;
        breakdown.push({
          factor: "gBizINFO 未登録",
          score:  SCORE.GBIZ_NOT_FOUND,
          detail: `法人番号 ${params.corporateNumber} が gBizINFO に存在しない`,
        });
      } else {
        details.isGbizRegistered = true;
        details.companyName      = gbizResult.name;
        details.established      = gbizResult.date_of_establishment;
        details.capitalJpy       = gbizResult.capital_stock_amount;
        details.representative   = gbizResult.representative_name;
        details.corporateNumber  = params.corporateNumber;

        // 設立年数チェック
        if (gbizResult.date_of_establishment) {
          const establishedMs = Date.parse(gbizResult.date_of_establishment);
          const ageMs = Date.now() - establishedMs;
          const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365);
          if (ageYears < 1) {
            totalScore += SCORE.ESTABLISHED_UNDER_1Y;
            breakdown.push({
              factor: "設立1年未満",
              score:  SCORE.ESTABLISHED_UNDER_1Y,
              detail: `設立: ${gbizResult.date_of_establishment}（${ageYears.toFixed(1)}年）`,
            });
          }
        }

        // 資本金チェック
        if (gbizResult.capital_stock_amount !== undefined &&
            gbizResult.capital_stock_amount < 1_000_000) {
          totalScore += SCORE.CAPITAL_UNDER_1M;
          breakdown.push({
            factor: "資本金100万円未満",
            score:  SCORE.CAPITAL_UNDER_1M,
            detail: `資本金: ¥${gbizResult.capital_stock_amount?.toLocaleString()}`,
          });
        }
      }
    } catch (err) {
      console.warn("[KYB] gBizINFO 照合失敗（スキップ）:", err);
    }
  }

  // ── 2. 国税庁 適格請求書番号照合 ─────────────────────────
  const invoiceNum = params.invoiceRegistrationNumber;
  if (invoiceNum) {
    try {
      const invoiceResult = await checkInvoiceRegistration(invoiceNum);
      details.isInvoiceQualified = invoiceResult.isQualified;
      if (!invoiceResult.isQualified) {
        totalScore += SCORE.INVOICE_NOT_QUALIFIED;
        breakdown.push({
          factor: "非適格請求書発行事業者",
          score:  SCORE.INVOICE_NOT_QUALIFIED,
          detail: invoiceResult.error ?? "国税庁照合の結果、適格事業者でない",
        });
      }
    } catch (err) {
      console.warn("[KYB] 国税庁 API 照合失敗（スキップ）:", err);
    }
  }

  // ── 3. IPinfo リスク判定 ──────────────────────────────────
  if (params.requesterIp) {
    try {
      const ipResult = await fetchIpInfo(params.requesterIp);
      if (ipResult) {
        details.ipRisk = ipResult.risk;
        if (ipResult.country !== "JP") {
          totalScore += SCORE.FOREIGN_IP;
          breakdown.push({
            factor: "日本国外 IP",
            score:  SCORE.FOREIGN_IP,
            detail: `アクセス元: ${ipResult.country} (${params.requesterIp})`,
          });
        }
        if (ipResult.risk === "high") {
          totalScore += SCORE.IP_RISK_HIGH;
          breakdown.push({
            factor: "高リスク IP",
            score:  SCORE.IP_RISK_HIGH,
            detail: `IPinfo リスク判定: high (${params.requesterIp})`,
          });
        } else if (ipResult.risk === "medium") {
          totalScore += SCORE.IP_RISK_MEDIUM;
          breakdown.push({
            factor: "中リスク IP",
            score:  SCORE.IP_RISK_MEDIUM,
            detail: `IPinfo リスク判定: medium (${params.requesterIp})`,
          });
        }
      }
    } catch (err) {
      console.warn("[KYB] IPinfo 照合失敗（スキップ）:", err);
    }
  }

  // ── 4. 総合判定 ───────────────────────────────────────────
  let verdict: KybVerdict;
  if (totalScore >= 90)      verdict = "BLOCKED";
  else if (totalScore >= 60) verdict = "REVIEW";
  else                       verdict = "APPROVED";

  return {
    verdict,
    riskScore:  totalScore,
    breakdown,
    details,
    escalate:   verdict !== "APPROVED",
    checkedAt:  new Date().toISOString(),
  };
}

// ─── gBizINFO API 呼び出し ────────────────────────────────────
interface GbizHojin {
  name?:                   string;
  date_of_establishment?:  string;
  capital_stock_amount?:   number;
  representative_name?:    string;
}

async function fetchGbizInfo(corporateNumber: string): Promise<GbizHojin | null> {
  const apiKey = process.env.GBIZINFO_API_KEY;
  if (!apiKey) {
    console.warn("[KYB] GBIZINFO_API_KEY 未設定 — gBizINFO 照合をスキップ");
    return null;
  }

  const res = await fetch(
    `https://info.gbiz.go.jp/api/ene/v1/hojin/${encodeURIComponent(corporateNumber)}`,
    {
      headers: {
        "X-hojin-info-api-key": apiKey,
        "Accept":               "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    },
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`gBizINFO HTTP ${res.status}`);

  const data = await res.json() as { hojin?: GbizHojin[] };
  return data.hojin?.[0] ?? null;
}

// ─── IPinfo API 呼び出し ──────────────────────────────────────
interface IpInfoResult {
  country: string;
  risk:    "low" | "medium" | "high";
}

async function fetchIpInfo(ip: string): Promise<IpInfoResult | null> {
  const token = process.env.IPINFO_TOKEN;
  if (!token) {
    console.warn("[KYB] IPINFO_TOKEN 未設定 — IP 照合をスキップ");
    return null;
  }

  // プライベート IP はスキップ
  if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip)) return null;

  const res = await fetch(
    `https://ipinfo.io/${ip}?token=${token}`,
    { signal: AbortSignal.timeout(5_000) },
  );
  if (!res.ok) throw new Error(`IPinfo HTTP ${res.status}`);

  const data = await res.json() as { country?: string; privacy?: { proxy?: boolean; vpn?: boolean; tor?: boolean } };
  const country = data.country ?? "XX";
  const privacy = data.privacy;
  const isHighRisk = privacy?.tor || (privacy?.proxy && privacy?.vpn);
  const isMediumRisk = privacy?.proxy || privacy?.vpn;

  return {
    country,
    risk: isHighRisk ? "high" : isMediumRisk ? "medium" : "low",
  };
}
