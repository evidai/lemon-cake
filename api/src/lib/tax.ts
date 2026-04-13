/**
 * 日本税務判定モジュール
 *
 * ① 国税庁 Web-API → 適格請求書発行事業者照合
 * ② 所得税法第204条 → 源泉徴収対象判定
 * ③ 送金額の動的修正（源泉分を控除）
 */

// ─── 国税庁 API レスポンス型 ─────────────────────────────────
export interface NtaRegistrant {
  registrationNumber: string;
  process:            "1" | "2" | "3"; // 1=登録 2=変更 3=削除
  name:               string;
  address:            string;
  businessType:       "1" | "2" | "3"; // 1=法人 2=人格のない社団等 3=個人
  kana?:              string;
  publicDate:         string;
  updateDate:         string;
  cancellationDate?:  string;
}

export interface NtaApiResponse {
  code:            "000" | string; // "000" = 正常
  registrantList?: NtaRegistrant[];
}

export interface InvoiceCheckResult {
  registrationNumber: string;
  isQualified:        boolean; // 適格請求書発行事業者かどうか
  registrant?:        NtaRegistrant;
  error?:             string;
}

// ─── ① 国税庁 API — 適格請求書発行事業者照合 ────────────────
const NTA_API_BASE = "https://web-api.invoice-kohyo.nta.go.jp/api/v1";

export async function checkInvoiceRegistration(
  registrationNumber: string,
): Promise<InvoiceCheckResult> {
  // T + 13桁の数字 (法人番号または個人番号)
  const normalized = registrationNumber.toUpperCase().trim();
  if (!/^T\d{13}$/.test(normalized)) {
    return {
      registrationNumber: normalized,
      isQualified: false,
      error: "無効な登録番号フォーマット (T + 13桁が必要)",
    };
  }

  try {
    const res = await fetch(
      `${NTA_API_BASE}/invoice/${encodeURIComponent(normalized)}?type=21`,
      {
        headers: {
          "Accept": "application/json",
          "Accept-Language": "ja",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      return {
        registrationNumber: normalized,
        isQualified: false,
        error: `国税庁API エラー: HTTP ${res.status}`,
      };
    }

    const data: NtaApiResponse = await res.json();

    if (data.code !== "000" || !data.registrantList?.length) {
      return { registrationNumber: normalized, isQualified: false };
    }

    const registrant = data.registrantList[0];
    // process "3" = 取消済み → 適格事業者ではない
    const isQualified = registrant.process !== "3" && !registrant.cancellationDate;

    return { registrationNumber: normalized, isQualified, registrant };
  } catch (err) {
    return {
      registrationNumber: normalized,
      isQualified: false,
      error: `国税庁API 通信エラー: ${(err as Error).message}`,
    };
  }
}

// ─── ② 所得税法第204条 — 源泉徴収対象キーワード分類 ─────────
// 対象区分（第204条第1項 各号）
const WITHHOLDING_CATEGORIES: { category: string; keywords: string[] }[] = [
  {
    category: "原稿料・講演料",
    keywords: ["原稿", "執筆", "講演", "著述", "翻訳", "通訳", "作詞", "作曲", "編曲", "脚本", "脚色"],
  },
  {
    category: "デザイン・イラスト",
    keywords: ["デザイン", "イラスト", "装丁", "図案", "ロゴ", "グラフィック", "UI設計", "UX設計"],
  },
  {
    category: "弁護士・税理士等報酬",
    keywords: ["弁護士", "税理士", "公認会計士", "弁理士", "司法書士", "行政書士", "社会保険労務士", "海事代理士"],
  },
  {
    category: "診療報酬",
    keywords: ["診療", "治療", "医療", "調剤", "歯科", "看護"],
  },
  {
    category: "広告・宣伝",
    keywords: ["広告宣伝", "懸賞", "賞金", "モデル料", "キャンペーン賞品"],
  },
  {
    category: "映像・音声制作",
    keywords: ["動画制作", "映像制作", "録音", "音声", "ナレーション", "声優"],
  },
];

// 対象外（API使用料・SaaS等 → 役務の対価として源泉不要）
const NON_WITHHOLDING_KEYWORDS = [
  "API", "SaaS", "クラウド", "ソフトウェア", "ライセンス", "システム利用",
  "サブスクリプション", "ホスティング", "インフラ", "データ", "検索",
];

export interface WithholdingCheckResult {
  required:     boolean;
  category?:    string;   // 該当する204条区分
  rate:         number;   // 税率 (例: 0.1021)
  grossAmount:  number;   // 支払い総額
  taxAmount:    number;   // 源泉税額
  netAmount:    number;   // 差し引き送金額
  confidence:   "high" | "medium" | "low"; // 判定信頼度
  reason:       string;
}

export function checkWithholdingTax(
  serviceDescription: string,
  grossAmountJpy: number,
): WithholdingCheckResult {
  const text = serviceDescription.toLowerCase();

  // 対象外キーワードが先に見つかれば源泉不要 (高信頼)
  const nonWithholdingMatch = NON_WITHHOLDING_KEYWORDS.find(kw =>
    text.includes(kw.toLowerCase()),
  );
  if (nonWithholdingMatch) {
    return {
      required:    false,
      rate:        0,
      grossAmount: grossAmountJpy,
      taxAmount:   0,
      netAmount:   grossAmountJpy,
      confidence:  "high",
      reason:      `「${nonWithholdingMatch}」はAPI/SaaS利用料として源泉徴収対象外`,
    };
  }

  // 204条対象キーワード検索
  for (const { category, keywords } of WITHHOLDING_CATEGORIES) {
    const matched = keywords.find(kw => text.includes(kw.toLowerCase()));
    if (matched) {
      // 100万円超は20.42%、以下は10.21%
      const rate = grossAmountJpy > 1_000_000 ? 0.2042 : 0.1021;
      const taxAmount  = Math.floor(grossAmountJpy * rate);
      const netAmount  = grossAmountJpy - taxAmount;
      return {
        required:    true,
        category,
        rate,
        grossAmount: grossAmountJpy,
        taxAmount,
        netAmount,
        confidence:  "high",
        reason:      `「${matched}」は所得税法第204条第1項 (${category}) に該当`,
      };
    }
  }

  // 判定不能 → 人間レビューフラグ
  return {
    required:    false,
    rate:        0,
    grossAmount: grossAmountJpy,
    taxAmount:   0,
    netAmount:   grossAmountJpy,
    confidence:  "low",
    reason:      "自動判定不可 — 税理士確認を推奨",
  };
}

// ─── ③ Evidence Chain — 国税庁APIレスポンスのハッシュ化 ────
import { createHash } from "crypto";

export function hashEvidence(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
}
