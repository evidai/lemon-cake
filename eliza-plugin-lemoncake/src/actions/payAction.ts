/**
 * EXECUTE_LEMONCAKE_PAYMENT アクション
 *
 * Eliza エージェントが LEMONCake を通じて有料 API を自律呼び出しするアクション。
 *
 * フロー:
 *   1. LEMONCAKE_PAY_TOKEN があればそれを使用
 *   2. なければ LEMONCAKE_BUYER_JWT で Pay Token を都度発行
 *   3. /api/proxy/:serviceId/:path 経由でサービスを呼び出し
 *   4. 結果（chargeId, amountUsdc, レスポンス）を HandlerCallback で返す
 */

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  type HandlerOptions,
  elizaLogger,
} from "@elizaos/core";
import { LemoncakeClient } from "../lib/lemoncakeClient.js";
import { LemoncakeError, PaymentParams } from "../types.js";
import { randomUUID } from "node:crypto";

// ─── 定数 ────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://api.lemoncake.xyz";

/** runtime.getSetting のキー名 */
const SETTING = {
  API_URL:   "LEMONCAKE_API_URL",
  PAY_TOKEN: "LEMONCAKE_PAY_TOKEN",
  BUYER_JWT: "LEMONCAKE_BUYER_JWT",
} as const;

// ─── ヘルパー ─────────────────────────────────────────────────────────────

function getStringSetting(runtime: IAgentRuntime, key: string): string | null {
  const v = runtime.getSetting(key);
  if (v === null || v === undefined || v === false) return null;
  return String(v) || null;
}

function buildClient(runtime: IAgentRuntime): LemoncakeClient {
  return new LemoncakeClient({
    apiUrl:   getStringSetting(runtime, SETTING.API_URL)   ?? DEFAULT_API_URL,
    payToken: getStringSetting(runtime, SETTING.PAY_TOKEN),
    buyerJwt: getStringSetting(runtime, SETTING.BUYER_JWT),
  });
}

/**
 * HandlerOptions.parameters（Elizaが自動抽出）または
 * メッセージテキストのシンプルパースから PaymentParams を組み立てる。
 */
function extractPaymentParams(
  message: Memory,
  options?: HandlerOptions | Record<string, unknown>,
): PaymentParams | null {
  // ── Elizaの自動パラメータ抽出を優先 ────────────────────────────────
  const params = (options as HandlerOptions | undefined)?.parameters;
  if (params) {
    const serviceId  = params["serviceId"]  as string | undefined;
    const limitUsdc  = params["limitUsdc"]  as string | undefined;
    const path       = params["path"]       as string | undefined;
    const method     = params["method"]     as string | undefined;
    const bodyStr    = params["body"]       as string | undefined;
    const buyerTag   = params["buyerTag"]   as string | undefined;

    if (serviceId && limitUsdc) {
      return {
        serviceId,
        limitUsdc,
        path:     path ?? "/",
        method:   (method as PaymentParams["method"]) ?? "POST",
        body:     bodyStr ? (JSON.parse(bodyStr) as Record<string, unknown>) : undefined,
        buyerTag: buyerTag,
      };
    }
  }

  // ── フォールバック: メッセージテキストから正規表現で抽出 ────────────
  const text = typeof message.content === "string"
    ? message.content
    : (message.content as { text?: string }).text ?? "";

  const serviceIdMatch = text.match(/serviceId[:\s]+([a-z0-9_-]+)/i);
  const limitMatch     = text.match(/\$?(\d+(?:\.\d{1,6})?)\s*(?:usdc|USDC)/);
  const pathMatch      = text.match(/path[:\s]+(\/[^\s,)]*)/i);

  const serviceId = serviceIdMatch?.[1];
  const limitUsdc = limitMatch?.[1];

  if (!serviceId || !limitUsdc) return null;

  return {
    serviceId,
    limitUsdc,
    path:    pathMatch?.[1] ?? "/",
    method:  "POST",
    buyerTag: `eliza-agent-${Date.now()}`,
  };
}

// ─── アクション定義 ───────────────────────────────────────────────────────

export const payAction: Action = {
  name: "EXECUTE_LEMONCAKE_PAYMENT",

  description:
    "LEMONCake を利用して、指定されたサービス（serviceId）に対し " +
    "指定額（USDC）の支払い（JWT Pay Token の発行と API 呼び出し）を実行する。" +
    "Pay Token の予算内でのみ動作し、上限超過時は自律的に停止する。",

  similes: [
    "PAY_WITH_LEMONCAKE",
    "CALL_PAID_API",
    "EXECUTE_PAYMENT",
    "ISSUE_PAY_TOKEN",
    "M2M_PAYMENT",
    "AUTONOMOUS_PAYMENT",
    "USDC_PAYMENT",
  ],

  // ─── Elizaの自動パラメータ抽出定義 ────────────────────────────────
  parameters: [
    {
      name:        "serviceId",
      description: "LEMONCake マーケットプレイスのサービスID（list_services で取得）",
      required:    true,
      schema:      { type: "string" },
    },
    {
      name:        "limitUsdc",
      description: "この呼び出しで使う上限額（USDC）例: '1.00'。省略時は '0.10'",
      required:    false,
      schema:      { type: "string", pattern: "^\\d+(\\.\\d{1,6})?$" },
    },
    {
      name:        "path",
      description: "サービス内のサブパス 例: '/search'。省略時は '/'",
      required:    false,
      schema:      { type: "string" },
    },
    {
      name:        "method",
      description: "HTTP メソッド（GET / POST / PUT / PATCH / DELETE）。省略時は POST",
      required:    false,
      schema:      { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
    },
    {
      name:        "body",
      description: "リクエストボディ（JSON 文字列）",
      required:    false,
      schema:      { type: "string" },
    },
    {
      name:        "buyerTag",
      description: "監査ログ用のタグ（エージェントセッション識別子など）",
      required:    false,
      schema:      { type: "string" },
    },
  ],

  // ─── validate ────────────────────────────────────────────────────────
  validate: async (runtime: IAgentRuntime, _message: Memory, _state?: State): Promise<boolean> => {
    const payToken = getStringSetting(runtime, SETTING.PAY_TOKEN);
    const buyerJwt = getStringSetting(runtime, SETTING.BUYER_JWT);

    const hasCredential = Boolean(payToken || buyerJwt);
    if (!hasCredential) {
      elizaLogger.warn(
        "[LEMONCake] validate: neither LEMONCAKE_PAY_TOKEN nor LEMONCAKE_BUYER_JWT is set. " +
        "Action will not be available.",
      );
    }
    return hasCredential;
  },

  // ─── handler ─────────────────────────────────────────────────────────
  handler: async (
    runtime:  IAgentRuntime,
    message:  Memory,
    _state?:  State,
    options?: HandlerOptions | Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    elizaLogger.info("[LEMONCake] payAction handler triggered");

    // ── 1. パラメータ抽出 ────────────────────────────────────────────
    const paymentParams = extractPaymentParams(message, options);

    if (!paymentParams) {
      const errText =
        "支払いに必要な情報が不足しています。" +
        "serviceId と limitUsdc（例: '1.00'）を指定してください。\n" +
        "例: 「serviceId: demo_agent_search_api に 0.50 USDC 支払いを実行して」";

      elizaLogger.warn("[LEMONCake] extractPaymentParams: missing required fields");
      await callback?.({ text: errText });
      return { success: false, error: "MISSING_PARAMS" };
    }

    const idempotencyKey = randomUUID();

    elizaLogger.debug({
      serviceId:      paymentParams.serviceId,
      limitUsdc:      paymentParams.limitUsdc,
      path:           paymentParams.path,
      idempotencyKey,
    }, "[LEMONCake] Payment params resolved");

    // ── 2. クライアント初期化 ────────────────────────────────────────
    const client = buildClient(runtime);

    try {
      // ── 3. Pay Token 解決（事前発行 or 都度発行） ──────────────────
      const payTokenJwt = await client.resolvePayToken({
        serviceId: paymentParams.serviceId,
        limitUsdc: paymentParams.limitUsdc,
        buyerTag:  paymentParams.buyerTag ?? `eliza-agent-${Date.now()}`,
      });

      // ── 4. サービス呼び出し ────────────────────────────────────────
      const result = await client.callService(payTokenJwt, {
        serviceId:      paymentParams.serviceId,
        path:           paymentParams.path,
        method:         paymentParams.method,
        body:           paymentParams.body,
        idempotencyKey,
      });

      // ── 5. 成功レスポンス ──────────────────────────────────────────
      const chargeInfo = result.chargeId
        ? `\n課金ID: \`${result.chargeId}\` / ${result.amountUsdc} USDC`
        : "";

      const responseText = typeof result.response === "string"
        ? result.response
        : JSON.stringify(result.response, null, 2);

      const successText =
        `✅ LEMONCake 決済成功${chargeInfo}\n\n` +
        `**サービス**: \`${paymentParams.serviceId}\`\n` +
        `**レスポンス**:\n\`\`\`json\n${responseText}\n\`\`\``;

      elizaLogger.info({
        serviceId:  paymentParams.serviceId,
        chargeId:   result.chargeId,
        amountUsdc: result.amountUsdc,
      }, "[LEMONCake] Payment completed");

      await callback?.({ text: successText });
      return { success: true, chargeId: result.chargeId, amountUsdc: result.amountUsdc };

    } catch (err: unknown) {
      // ── 6. エラーハンドリング ──────────────────────────────────────
      if (err instanceof LemoncakeError) {
        elizaLogger.error({
          code:      err.code,
          message:   err.message,
          retryable: err.retryable,
        }, "[LEMONCake] Payment failed");

        const userMessage = buildUserErrorMessage(err);
        await callback?.({ text: userMessage });
        return { success: false, error: err.code, retryable: err.retryable };
      }

      // 予期しないエラー
      const msg = err instanceof Error ? err.message : String(err);
      elizaLogger.error({ message: msg }, "[LEMONCake] Unexpected error");
      await callback?.({ text: `❌ 予期しないエラーが発生しました: ${msg}` });
      return { success: false, error: "UNKNOWN" };
    }
  },

  // ─── examples ────────────────────────────────────────────────────────
  examples: [
    [
      {
        name: "User",
        content: { text: "LEMONCake の demo_agent_search_api を 0.50 USDC で呼び出して" },
      },
      {
        name: "Agent",
        content: {
          text: "LEMONCake 経由で demo_agent_search_api を呼び出します。",
          action: "EXECUTE_LEMONCAKE_PAYMENT",
        },
      },
    ],
    [
      {
        name: "User",
        content: { text: "serviceId: svc_invoice_check に 0.10 USDC 支払い実行" },
      },
      {
        name: "Agent",
        content: {
          text: "Pay Token を発行して svc_invoice_check を呼び出します。",
          action: "EXECUTE_LEMONCAKE_PAYMENT",
        },
      },
    ],
    [
      {
        name: "User",
        content: { text: "USDC で API 料金を払って検索を実行して" },
      },
      {
        name: "Agent",
        content: {
          text: "LEMONCake Pay Token を使って検索 API を呼び出します。",
          action: "EXECUTE_LEMONCAKE_PAYMENT",
        },
      },
    ],
  ],
};

// ─── エラーメッセージ生成 ─────────────────────────────────────────────────

function buildUserErrorMessage(err: LemoncakeError): string {
  switch (err.code) {
    case "CREDENTIAL_MISSING":
      return (
        "❌ LEMONCake の認証情報が設定されていません。\n\n" +
        ".env または character の settings に以下を設定してください:\n" +
        "```\n" +
        "LEMONCAKE_PAY_TOKEN=<ダッシュボードで発行した Pay Token>\n" +
        "# または\n" +
        "LEMONCAKE_BUYER_JWT=<ダッシュボードの Settings からコピー>\n" +
        "```\n" +
        "👉 https://lemoncake.xyz/dashboard"
      );
    case "INSUFFICIENT_BALANCE":
      return "❌ USDC 残高が不足しています。ダッシュボードから JPYC でチャージしてください。\n👉 https://lemoncake.xyz/dashboard";
    case "TOKEN_LIMIT_EXCEEDED":
      return "❌ Pay Token の上限額に達しました。新しいトークンを発行するか、limitUsdc を増やして再試行してください。";
    case "TOKEN_EXPIRED":
      return "❌ Pay Token または Buyer JWT の有効期限が切れています。ダッシュボードで新しいトークンを発行してください。";
    case "SERVICE_NOT_FOUND":
      return `❌ サービスが見つかりません。serviceId が正しいか確認してください。`;
    case "SERVICE_NOT_APPROVED":
      return "❌ このサービスはまだ承認されていません。LEMONCake の審査をお待ちください。";
    case "RATE_LIMITED":
      return `❌ レート制限に達しました。${err.retryAfterSec ? `${err.retryAfterSec}秒後` : "しばらく"}に再試行してください。`;
    case "NETWORK_ERROR":
      return "❌ LEMONCake API への接続に失敗しました。ネットワークを確認して再試行してください。";
    default:
      return `❌ LEMONCake エラー: ${err.message}`;
  }
}
