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
  { name: "lemon-cake-mcp", version: MCP_VERSION },
  { capabilities: { tools: {} } },
);

// ── ツール定義 ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [

    // ─── setup（認証不要） ────────────────────────────────────────────────
    {
      name: "setup",
      description: [
        "Show the LemonCake MCP first-run setup guide. No authentication required.",
        "Call this tool FIRST to learn what credentials are missing and how to obtain them.",
        "",
        "Returns the current credential status (Pay Token / Buyer JWT) and step-by-step",
        "instructions to obtain anything that is missing, including a sample MCP client",
        "config snippet ready to paste.",
        "",
        "Returns: { version, apiUrl, credentials, availableTools, setupSteps, register, dashboard, docs }",
        "Errors: none — this tool always succeeds.",
      ].join("\n"),
      annotations: {
        title:           "Setup guide",
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  true,
        openWorldHint:   false,
      },
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },

    // ─── list_services（認証不要） ───────────────────────────────────────
    {
      name: "list_services",
      description: [
        "List approved API services available on the LemonCake marketplace. No authentication required.",
        "",
        "Use this BEFORE call_service to discover serviceId values and per-call USDC pricing.",
        "",
        "Each item: { id, name, provider, type ('API' | 'MCP'), pricePerCall, endpoint }.",
        "Errors: HTTP-level errors are returned as `Error: API <status>: <body>`.",
      ].join("\n"),
      annotations: {
        title:           "List marketplace services",
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  true,
        openWorldHint:   true,
      },
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: {
            type:        "integer",
            minimum:     1,
            maximum:     100,
            default:     50,
            description: "Maximum number of services to return (default 50, max 100).",
          },
        },
      },
    },

    // ─── call_service（PAY_TOKEN 必須） ──────────────────────────────────
    {
      name: "call_service",
      description: [
        "Invoke an upstream API service through LemonCake's pay-per-call proxy.",
        "Each successful call automatically charges USDC against your configured Pay Token.",
        "",
        "PRECONDITIONS:",
        "  • LEMON_CAKE_PAY_TOKEN env var must be set. If missing, the tool returns a",
        "    structured CREDENTIAL_MISSING error (not a thrown exception) with how-to-fix steps.",
        "  • serviceId must come from list_services.",
        "",
        "BEHAVIOR:",
        "  • Returns the upstream response body verbatim (JSON or text), plus the X-Charge-Id",
        "    and X-Amount-Usdc headers reported by the proxy.",
        "  • HTTP 402 Payment Required is returned as a normal result (NOT thrown) so the",
        "    agent can autonomously stop spending when the Pay Token's limitUsdc is exhausted.",
        "  • Pass the same idempotencyKey to retry safely without double-charging.",
        "  • This tool spends real money and contacts an external service — it is",
        "    non-idempotent by default and has external side effects.",
        "",
        "Returns: { status, chargeId, amountUsdc, response }",
      ].join("\n"),
      annotations: {
        title:           "Call a paid service (charges USDC)",
        readOnlyHint:    false,
        destructiveHint: false,
        idempotentHint:  false,
        openWorldHint:   true,
      },
      inputSchema: {
        type: "object",
        required: ["serviceId"],
        additionalProperties: false,
        properties: {
          serviceId: {
            type:        "string",
            description: "ID of the service to call (obtain from list_services).",
            minLength:   1,
          },
          path: {
            type:        "string",
            description: "Sub-path on the service (e.g. \"/search\", \"/v1/completions\"). Defaults to \"/\".",
            default:     "/",
            pattern:     "^/.*",
          },
          method: {
            type:        "string",
            enum:        ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method to use against the service. Defaults to GET.",
            default:     "GET",
          },
          body: {
            type:                 "object",
            description:          "JSON request body (only used for POST/PUT/PATCH).",
            additionalProperties: true,
          },
          idempotencyKey: {
            type:        "string",
            description: "Optional idempotency key (UUID recommended). Identical keys within the proxy's retention window return the cached result without re-charging.",
            format:      "uuid",
          },
        },
      },
    },

    // ─── check_balance（BUYER_JWT 必須） ─────────────────────────────────
    {
      name: "check_balance",
      description: [
        "Check the current USDC balance, KYC tier, and account info of the configured buyer.",
        "",
        "PRECONDITIONS:",
        "  • LEMON_CAKE_BUYER_JWT env var must be set. If missing, returns a structured",
        "    CREDENTIAL_MISSING error with how-to-fix steps (no exception thrown).",
        "",
        "Use BEFORE call_service to confirm sufficient funds, especially before a long batch.",
        "",
        "Returns: { balanceUsdc, kycTier, email, name }",
      ].join("\n"),
      annotations: {
        title:           "Check USDC balance",
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  true,
        openWorldHint:   true,
      },
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },

    // ─── check_tax（認証不要） ───────────────────────────────────────────
    {
      name: "check_tax",
      description: [
        "Run a Japanese tax compliance check on a single transaction. No authentication required.",
        "",
        "Performs three checks in one call:",
        "  1. Validates the qualified-invoice registration number (T-number) against the NTA registry.",
        "  2. Determines whether source-withholding (源泉徴収) applies based on the service description.",
        "  3. If withholding applies, computes the withholding amount and net payable.",
        "",
        "Intended for Japanese corporations that pay AI / API services and need to file",
        "withholding correctly under the qualified-invoice (インボイス制度) regime.",
        "",
        "Returns: { invoice: { valid, name, ... }, withholding: { required, rate, amount, net } }",
        "Errors: invalid registrationNumber returns invoice.valid = false (not an exception).",
      ].join("\n"),
      annotations: {
        title:           "Japanese tax compliance check",
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  true,
        openWorldHint:   true,
      },
      inputSchema: {
        type: "object",
        required: ["registrationNumber", "serviceDescription", "grossAmountJpy"],
        additionalProperties: false,
        properties: {
          registrationNumber: {
            type:        "string",
            description: "Qualified-invoice registration number issued by the Japanese NTA (e.g. \"T1234567890123\").",
            pattern:     "^T?\\d{13}$",
          },
          serviceDescription: {
            type:        "string",
            description: "Plain-text description of what was purchased. Used to classify whether source-withholding applies.",
            minLength:   1,
          },
          grossAmountJpy: {
            type:        "number",
            description: "Gross transaction amount in JPY, tax inclusive.",
            exclusiveMinimum: 0,
          },
        },
      },
    },

    // ─── get_service_stats（認証不要） ───────────────────────────────────
    {
      name: "get_service_stats",
      description: [
        "Return public usage statistics for every approved service on the marketplace. No authentication required.",
        "",
        "Use this AFTER list_services and BEFORE call_service to pick a service based on",
        "real-world traction (call counts, USDC revenue, last-used timestamp).",
        "",
        "Returns: an array of { serviceId, callCount, totalRevenueUsdc, lastCalledAt }.",
      ].join("\n"),
      annotations: {
        title:           "Marketplace usage stats",
        readOnlyHint:    true,
        destructiveHint: false,
        idempotentHint:  true,
        openWorldHint:   true,
      },
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
