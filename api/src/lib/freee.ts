/**
 * freee 会計 API 連携
 *
 * 決済完了後、自動的に仕訳（取引）を作成する。
 * 源泉徴収が発生した場合は預り金として科目按分。
 *
 * 前提:
 * - FREEE_CLIENT_ID:     freee アプリのクライアントID
 * - FREEE_CLIENT_SECRET: freee アプリのクライアントシークレット
 * - FREEE_ACCESS_TOKEN:  OAuthアクセストークン（初回は手動取得）
 * - FREEE_COMPANY_ID:    freee 事業所ID
 */

const FREEE_API_BASE    = "https://api.freee.co.jp";
const FREEE_AUTH_BASE   = "https://accounts.secure.freee.co.jp";

// ─── OAuth トークン取得 ──────────────────────────────────────
export async function refreshFreeeToken(refreshToken: string): Promise<{
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;
}> {
  const res = await fetch(`${FREEE_AUTH_BASE}/public_api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "refresh_token",
      client_id:     process.env.FREEE_CLIENT_ID,
      client_secret: process.env.FREEE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`freee token refresh failed: ${res.status}`);
  const data = await res.json() as {
    access_token: string; refresh_token: string; expires_in: number;
  };
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresIn:    data.expires_in,
  };
}

// ─── 仕訳作成パラメータ ──────────────────────────────────────
export interface CreateDealParams {
  issueDate:          string;  // "YYYY-MM-DD"
  description:        string;  // 摘要
  amountUsdc:         string;  // 決済額 (USDC)
  amountJpy:          number;  // 円換算額
  providerName:       string;  // 支払い先名
  invoiceRegistered:  boolean; // 適格請求書発行事業者かどうか
  withholding?: {
    required:    boolean;
    taxAmount:   number;       // 源泉税額 (JPY)
    netAmount:   number;       // 差引き額 (JPY)
    evidenceHash: string;      // 国税庁API照合証跡ハッシュ
  };
}

// ─── freee 取引（仕訳）作成 ───────────────────────────────────
export async function createFreeeTransaction(params: CreateDealParams): Promise<{
  dealId: number;
  url:    string;
}> {
  const accessToken = process.env.FREEE_ACCESS_TOKEN;
  const companyId   = process.env.FREEE_COMPANY_ID;
  if (!accessToken || !companyId) {
    throw new Error("FREEE_ACCESS_TOKEN または FREEE_COMPANY_ID が未設定");
  }

  const memo = [
    params.description,
    `USDC: ${params.amountUsdc}`,
    `国税庁API照合: ${params.invoiceRegistered ? "適格事業者 ✓" : "非適格 ✗"}`,
    params.withholding?.evidenceHash
      ? `Evidence Hash: ${params.withholding.evidenceHash.slice(0, 16)}...`
      : null,
  ].filter(Boolean).join(" | ");

  // 仕訳の借方/貸方明細を構築
  const details: object[] = [];

  if (params.withholding?.required) {
    // 源泉徴収あり: 外注費 / 預り金（源泉所得税）/ 普通預金
    details.push(
      {
        account_item_name: "外注費",
        tax_name:          params.invoiceRegistered ? "課税仕入（10%）" : "課税仕入不可（非適格）",
        amount:            params.amountJpy,
        entry_side:        "debit",   // 借方
        description:       memo,
      },
      {
        account_item_name: "預り金",  // 源泉所得税
        amount:            params.withholding.taxAmount,
        entry_side:        "credit",  // 貸方
        description:       `源泉所得税（${(params.withholding.taxAmount / params.amountJpy * 100).toFixed(2)}%）`,
      },
      {
        account_item_name: "普通預金",
        amount:            params.withholding.netAmount,
        entry_side:        "credit",  // 貸方
        description:       `${params.providerName} への支払い（差引後）`,
      },
    );
  } else {
    // 源泉徴収なし: 通信費（API利用料）/ 普通預金
    details.push(
      {
        account_item_name: "通信費",  // API利用料
        tax_name:          params.invoiceRegistered ? "課税仕入（10%）" : "課税仕入不可（非適格）",
        amount:            params.amountJpy,
        entry_side:        "debit",
        description:       memo,
      },
      {
        account_item_name: "普通預金",
        amount:            params.amountJpy,
        entry_side:        "credit",
        description:       `${params.providerName} への支払い`,
      },
    );
  }

  const body = {
    company_id: parseInt(companyId),
    issue_date: params.issueDate,
    type:       "expense",
    details,
  };

  const res = await fetch(`${FREEE_API_BASE}/api/1/deals`, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[freee] API error: ${res.status}`, errBody);
    throw new Error(`freee API エラー: ${res.status}`);
  }

  const data = await res.json() as { deal: { id: number } };
  const dealId = data.deal.id;

  return {
    dealId,
    url: `https://secure.freee.co.jp/accounting/deals/${dealId}`,
  };
}

// ─── freee OAuth 認可 URL 生成 ────────────────────────────────
export function getFreeeAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     process.env.FREEE_CLIENT_ID ?? "",
    redirect_uri:  process.env.FREEE_REDIRECT_URI ?? "http://localhost:3002/api/freee/callback",
    scope:         "read write",
    state,
  });
  return `${FREEE_AUTH_BASE}/public_api/authorize?${params}`;
}

// ─── freee 認可コード → トークン交換 ─────────────────────────
export async function exchangeFreeeCode(code: string): Promise<{
  accessToken:  string;
  refreshToken: string;
  companyId?:   string;
}> {
  const res = await fetch(`${FREEE_AUTH_BASE}/public_api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "authorization_code",
      client_id:     process.env.FREEE_CLIENT_ID,
      client_secret: process.env.FREEE_CLIENT_SECRET,
      redirect_uri:  process.env.FREEE_REDIRECT_URI ?? "http://localhost:3002/api/freee/callback",
      code,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`freee code exchange failed: ${res.status} — ${body}`);
  const data = JSON.parse(body) as {
    access_token: string; refresh_token: string;
  };
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
  };
}
