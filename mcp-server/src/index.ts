#!/usr/bin/env node
/**
 * LemonCake MCP Server v0.2.0
 *
 * AIエージェントにLemonCakeの決済インフラを提供するMCPサーバー。
 *
 * Tools:
 *  - setup             : 初回セットアップガイド（認証不要）
 *  - list_services     : マーケットプレイスの公開サービス一覧（認証不要）
 *  - get_service_stats : サービスの利用統計（認証不要）
 *  - check_tax         : 日本の税務コンプライアンス確認（認証不要）
 *  - check_balance     : USDC残高確認（LEMON_CAKE_BUYER_JWT 必須）
 *  - call_service      : Pay-per-call APIプロキシ（LEMON_CAKE_PAY_TOKEN 必須）
 *
 * 環境変数:
 *  LEMON_CAKE_PAY_TOKEN  : Pay Token JWT（ダッシュボードで発行）※ call_service に必須
 *  LEMON_CAKE_BUYER_JWT  : Buyer JWT（ログイン時に取得）     ※ check_balance に必須
 *  LEMON_CAKE_API_URL    : APIベースURL（省略可）
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── 設定 ──────────────────────────────────────────────────────────────────────

const API_URL   = (process.env.LEMON_CAKE_API_URL  ?? "https://api.lemoncake.xyz").replace(/\/$/, "");
const PAY_TOKEN = process.env.LEMON_CAKE_PAY_TOKEN ?? "";
const BUYER_JWT = process.env.LEMON_CAKE_BUYER_JWT ?? "";

// ── バージョン・ユーザーエージェント ─────────────────────────────────────
const MCP_VERSION = "0.3.0";
const USER_AGENT  = `lemon-cake-mcp/${MCP_VERSION} (node/${process.versions.node}; ${process.platform} ${process.arch})`;

// ── 登録/入金/ダッシュボード URL（UTM 付きで経由クライアントを区別） ──
const UTM            = "utm_source=mcp-server&utm_medium=cli";
const REGISTER_URL   = `https://lemoncake.xyz/register?${UTM}&utm_campaign=credential-missing`;
const DASHBOARD_URL  = `https://lemoncake.xyz/dashboard?${UTM}`;
const BILLING_URL    = `https://lemoncake.xyz/dashboard/billing?${UTM}&utm_campaign=topup`;
const DOCS_URL       = `https://lemoncake.xyz/docs/quickstart?${UTM}`;

// ── 起動時: 認証状態を stderr に出力（MCP クライアントのログに残る）───────────

const hasPayToken = PAY_TOKEN.length > 0;
const hasBuyerJwt = BUYER_JWT.length > 0;

console.error("[LemonCake MCP] Starting...");
console.error(`[LemonCake MCP]   API URL     : ${API_URL}`);
console.error(`[LemonCake MCP]   PAY_TOKEN   : ${hasPayToken ? "✓ set" : "✗ NOT SET — call_service will be unavailable"}`);
console.error(`[LemonCake MCP]   BUYER_JWT   : ${hasBuyerJwt ? "✓ set" : "✗ NOT SET — check_balance will be unavailable"}`);

if (!hasPayToken || !hasBuyerJwt) {
  console.error("[LemonCake MCP]");
  console.error("[LemonCake MCP]   🚀 Get started in 3 minutes:");
  console.error(`[LemonCake MCP]     1. Create a free account  →  ${REGISTER_URL}`);
  console.error("[LemonCake MCP]     2. Top up balance ($5 USDC / JPYC supported)");
  console.error("[LemonCake MCP]     3. Issue a Pay Token or copy Buyer JWT from Dashboard");
  console.error("[LemonCake MCP]");
  console.error("[LemonCake MCP]   Or call the `setup` tool from your MCP client for interactive guidance.");
}

// ── ヘルパー ──────────────────────────────────────────────────────────────────

async function apiGet(path: string, auth?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type":       "application/json",
      "User-Agent":         USER_AGENT,
      "X-LemonCake-Client": USER_AGENT,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function apiPost(path: string, data: unknown, auth?: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type":       "application/json",
      "User-Agent":         USER_AGENT,
      "X-LemonCake-Client": USER_AGENT,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** 未設定の認証情報に対して、取得方法を含む分かりやすいエラーを返す */
function credentialError(envVar: string, toolName: string) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: `${envVar} is not configured.`,
        code:  "CREDENTIAL_MISSING",
        howToFix: [
          `1. Create a free account → ${REGISTER_URL}`,
          `2. Top up balance ($5 USDC or JPYC) → ${BILLING_URL}`,
          envVar === "LEMON_CAKE_PAY_TOKEN"
            ? `3. Dashboard → Tokens → Issue Pay Token (set your spending limit) → ${DASHBOARD_URL}`
            : `3. Dashboard → Settings → Copy your Buyer JWT → ${DASHBOARD_URL}`,
          `4. Add to your MCP client config:`,
          `   "env": { "${envVar}": "<paste token here>" }`,
          `5. Restart your MCP client`,
        ],
        docs: DOCS_URL,
        tip: `You can also call the 'setup' tool to see full setup instructions.`,
      }, null, 2),
    }],
    isError: true,
  };
}

// ── サーバー初期化 ────────────────────────────────────────────────────────────

const server = new Server(
  { name: "lemon-cake-mcp", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

// ── ツール定義 ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [

    // ─── setup（認証不要） ────────────────────────────────────────────────
    {
      name: "setup",
      description: [
        "LemonCake MCPサーバーの初回セットアップガイドを表示します。",
        "認証不要。まず最初にこのツールを呼び出してください。",
        "",
        "現在の認証状態と、不足している認証情報の取得手順を返します。",
        "Pay Token（call_service用）と Buyer JWT（check_balance用）が必要です。",
      ].join("\n"),
      inputSchema: { type: "object", properties: {} },
    },

    // ─── list_services（認証不要） ───────────────────────────────────────
    {
      name: "list_services",
      description: [
        "LemonCakeマーケットプレイスで利用可能なAPIサービス一覧を返します。",
        "認証不要で呼び出せます。",
        "",
        "各サービスには id, name, type (API|MCP), pricePerCall (USDC) が含まれます。",
        "call_service で使う serviceId もここで取得します。",
      ].join("\n"),
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "返す件数の上限（デフォルト 50、最大 100）",
          },
        },
      },
    },

    // ─── call_service（PAY_TOKEN 必須） ──────────────────────────────────
    {
      name: "call_service",
      description: [
        "LemonCakeのPay-per-callプロキシ経由でAPIサービスを呼び出します。",
        "呼び出しのたびに設定済みのPay Tokenから自動的に課金されます。",
        "",
        "【必須】LEMON_CAKE_PAY_TOKEN 環境変数の設定が必要です。",
        "未設定の場合はエラーと取得手順を返します。",
        "",
        "Pay Tokenには上限額（limitUsdc）が設定されており、",
        "上限に達すると 402 Payment Required が返り、自動的に停止します。",
        "",
        "serviceId は list_services で取得してください。",
      ].join("\n"),
      inputSchema: {
        type: "object",
        required: ["serviceId"],
        properties: {
          serviceId: {
            type: "string",
            description: "呼び出すサービスのID（list_servicesで取得）",
          },
          path: {
            type: "string",
            description: "サービスのサブパス（例: \"/search\", \"/v1/completions\"）。デフォルトは \"/\"",
            default: "/",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTPメソッド（デフォルト: GET）",
            default: "GET",
          },
          body: {
            type: "object",
            description: "リクエストボディ（POST/PUT/PATCH時）",
          },
          idempotencyKey: {
            type: "string",
            description: "冪等キー（任意）。同じキーで2回呼び出した場合、2回目は課金されません。UUIDを推奨。",
          },
        },
      },
    },

    // ─── check_balance（BUYER_JWT 必須） ─────────────────────────────────
    {
      name: "check_balance",
      description: [
        "設定済みバイヤーアカウントのUSDC残高とKYCティアを確認します。",
        "",
        "【必須】LEMON_CAKE_BUYER_JWT 環境変数の設定が必要です。",
        "未設定の場合はエラーと取得手順を返します。",
        "",
        "call_serviceを実行する前に残高を確認したいときに使います。",
      ].join("\n"),
      inputSchema: { type: "object", properties: {} },
    },

    // ─── check_tax（認証不要） ───────────────────────────────────────────
    {
      name: "check_tax",
      description: [
        "日本の税務コンプライアンスチェックを行います。認証不要。",
        "",
        "・適格請求書番号（T番号）の有効性を国税庁APIで照合",
        "・取引に源泉徴収が必要かどうかを判定",
        "・源泉税額の計算",
        "",
        "日本の法人がAI APIサービスの支払いを処理する際に使います。",
      ].join("\n"),
      inputSchema: {
        type: "object",
        required: ["registrationNumber", "serviceDescription", "grossAmountJpy"],
        properties: {
          registrationNumber: {
            type: "string",
            description: "適格請求書登録番号（例: T1234567890123）",
          },
          serviceDescription: {
            type: "string",
            description: "取引内容の説明（源泉徴収判定に使用）",
          },
          grossAmountJpy: {
            type: "number",
            description: "取引金額（税込、円）",
          },
        },
      },
    },

    // ─── get_service_stats（認証不要） ───────────────────────────────────
    {
      name: "get_service_stats",
      description: [
        "全サービスの公開利用統計を返します。認証不要。",
        "",
        "各サービスの呼び出し回数・総売上（USDC）・最終呼び出し日時が含まれます。",
        "call_serviceで呼ぶサービスを選ぶ前に人気・実績を確認するために使います。",
      ].join("\n"),
      inputSchema: { type: "object", properties: {} },
    },

  ],
}));

// ── ツール実装 ────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {

      // ─── setup ──────────────────────────────────────────────────────────
      case "setup": {
        const status = {
          payToken:  hasPayToken ? "✓ 設定済み" : "✗ 未設定（call_service が使えません）",
          buyerJwt:  hasBuyerJwt ? "✓ 設定済み" : "✗ 未設定（check_balance が使えません）",
        };

        const steps: string[] = [];

        if (!hasPayToken || !hasBuyerJwt) {
          steps.push("=== セットアップ手順 ===");
          steps.push("");
          steps.push("1. 無料アカウント作成（3分で完了）");
          steps.push(`   → ${REGISTER_URL}`);
          steps.push("");
          steps.push("2. USDC残高をチャージ（$5〜）");
          steps.push(`   → ${BILLING_URL}`);
          steps.push("   JPYCまたはUSDCで入金可能");
          steps.push("");
        }

        if (!hasPayToken) {
          steps.push("3. Pay Tokenを発行（call_service に必要）");
          steps.push("   Dashboard → Tokens → 「Pay Tokenを発行」");
          steps.push("   ・serviceId: 使いたいサービスのIDを選択");
          steps.push("   ・limitUsdc: このトークンで使える上限額（例: 5.00）");
          steps.push("   → 発行されたJWTをコピー");
          steps.push("");
          steps.push("4. MCP設定ファイルに追加:");
          steps.push('   "LEMON_CAKE_PAY_TOKEN": "<コピーしたJWT>"');
          steps.push("");
        }

        if (!hasBuyerJwt) {
          steps.push(!hasPayToken ? "5." : "3." + " Buyer JWTを取得（check_balance に必要）");
          steps.push("   Dashboard → Settings → 「Buyer JWTをコピー」");
          steps.push('   "LEMON_CAKE_BUYER_JWT": "<コピーしたJWT>"');
          steps.push("");
        }

        steps.push("=== MCP設定ファイルのサンプル ===");
        steps.push("");
        steps.push(JSON.stringify({
          mcpServers: {
            "lemon-cake": {
              command: "npx",
              args:    ["-y", "lemon-cake-mcp"],
              env: {
                LEMON_CAKE_PAY_TOKEN:  hasPayToken ? "(設定済み)" : "<ダッシュボードで発行したPay Token JWT>",
                LEMON_CAKE_BUYER_JWT:  hasBuyerJwt ? "(設定済み)" : "<ダッシュボードのSettingsからコピーしたJWT>",
              },
            },
          },
        }, null, 2));

        return json({
          version:       MCP_VERSION,
          apiUrl:        API_URL,
          credentials:   status,
          availableTools: {
            noAuth:       ["setup", "list_services", "get_service_stats", "check_tax"],
            needPayToken: ["call_service"],
            needBuyerJwt: ["check_balance"],
          },
          setupSteps: steps.length > 0 ? steps.join("\n") : "✅ 全ての認証情報が設定されています。",
          register:   REGISTER_URL,
          dashboard:  DASHBOARD_URL,
          docs:       "https://github.com/evidai/lemon-cake",
        });
      }

      // ─── list_services ───────────────────────────────────────────────────
      case "list_services": {
        const limit = (args.limit as number | undefined) ?? 50;
        const services = await apiGet(`/api/services?reviewStatus=APPROVED&limit=${limit}`) as any[];
        return json(services.map((s: any) => ({
          id:           s.id,
          name:         s.name,
          provider:     s.providerName,
          type:         s.type,
          pricePerCall: `${s.pricePerCallUsdc} USDC`,
          endpoint:     s.endpoint ?? "(proxied)",
        })));
      }

      // ─── call_service ────────────────────────────────────────────────────
      case "call_service": {
        if (!PAY_TOKEN) return credentialError("LEMON_CAKE_PAY_TOKEN", "call_service");

        const serviceId      = args.serviceId as string;
        const subPath        = (args.path as string | undefined) ?? "/";
        const method         = (args.method as string | undefined) ?? "GET";
        const body           = args.body as Record<string, unknown> | undefined;
        const idempotencyKey = args.idempotencyKey as string | undefined;

        const normalizedPath = subPath.startsWith("/") ? subPath : `/${subPath}`;
        const url = `${API_URL}/api/proxy/${serviceId}${normalizedPath}`;

        const headers: Record<string, string> = {
          "Content-Type":       "application/json",
          "Authorization":      `Bearer ${PAY_TOKEN}`,
          "User-Agent":         USER_AGENT,
          "X-LemonCake-Client": USER_AGENT,
        };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

        const fetchOptions: RequestInit = { method, headers };
        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);
        const chargeId   = res.headers.get("X-Charge-Id");
        const amountUsdc = res.headers.get("X-Amount-Usdc");

        let responseBody: unknown;
        if ((res.headers.get("content-type") ?? "").includes("application/json")) {
          responseBody = await res.json();
        } else {
          responseBody = await res.text();
        }

        // 402 の場合もエラーではなく構造化レスポンスとして返す
        // （エージェントが自律的に停止判断できるように）
        return json({ status: res.status, chargeId, amountUsdc, response: responseBody });
      }

      // ─── check_balance ───────────────────────────────────────────────────
      case "check_balance": {
        if (!BUYER_JWT) return credentialError("LEMON_CAKE_BUYER_JWT", "check_balance");
        const me = await apiGet("/api/auth/me", BUYER_JWT) as any;
        return json({
          balanceUsdc: me.buyer?.balanceUsdc ?? me.balanceUsdc,
          kycTier:     me.buyer?.kycTier     ?? me.kycTier,
          email:       me.email,
          name:        me.name,
        });
      }

      // ─── check_tax ───────────────────────────────────────────────────────
      case "check_tax": {
        const result = await apiPost("/api/tax/full-check", {
          registrationNumber: args.registrationNumber,
          serviceDescription: args.serviceDescription,
          grossAmountJpy:     args.grossAmountJpy,
        });
        return json(result);
      }

      // ─── get_service_stats ───────────────────────────────────────────────
      case "get_service_stats": {
        const stats = await apiGet("/api/services/stats");
        return json(stats);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${msg}` }],
      isError: true,
    };
  }
});

// ── 起動 ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[LemonCake MCP] Ready.");
}

main().catch((err) => {
  console.error("[LemonCake MCP] Fatal:", err);
  process.exit(1);
});
