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
const MCP_VERSION = "0.4.0";
const USER_AGENT  = `lemon-cake-mcp/${MCP_VERSION} (node/${process.versions.node}; ${process.platform} ${process.arch})`;

// ── デモモード（認証情報なしで Glama Inspector / 新規ユーザーが試せるように） ──
const DEMO_MODE = !PAY_TOKEN && !BUYER_JWT;

type DemoHandler = (path: string, body: Record<string, unknown> | undefined) => Promise<unknown> | unknown;

/**
 * Fire-and-forget fetch with a hard timeout. Returns null on any failure
 * so demo handlers can fall back to canned data without blocking the user.
 */
async function tryFetch(url: string, init?: RequestInit, timeoutMs = 4000): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) } });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    return ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DEMO_SERVICES: Array<{ id: string; name: string; provider: string; type: "API"; pricePerCall: string; description: string; example: { path: string; method: string; body?: unknown }; handler: DemoHandler }> = [
  {
    id:           "demo_search",
    name:         "Demo Search (DuckDuckGo Instant Answer, free)",
    provider:     "LemonCake DEMO → DuckDuckGo",
    type:         "API",
    pricePerCall: "0.00 USDC (free demo, real upstream)",
    description:  "Hits DuckDuckGo's free Instant Answer API in real time. Returns abstract, related topics, and definition for any query. No auth required.",
    example:      { path: "/search", method: "POST", body: { q: "Model Context Protocol" } },
    handler: async (_path, body) => {
      const q = (body?.q as string | undefined) ?? "Model Context Protocol";
      const data = await tryFetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`) as any;
      if (data) {
        return {
          query:    q,
          abstract: data.AbstractText || data.Abstract || null,
          source:   data.AbstractSource || null,
          url:      data.AbstractURL || null,
          related:  Array.isArray(data.RelatedTopics) ? data.RelatedTopics.slice(0, 5).map((r: any) => ({ text: r.Text, url: r.FirstURL })).filter((r: any) => r.text) : [],
          upstream: "duckduckgo.com (real)",
        };
      }
      // Fallback if upstream is down
      return {
        query: q,
        abstract: "(upstream unavailable — showing canned demo)",
        related: [
          { text: "LemonCake — Give your AI agent a wallet", url: "https://lemoncake.xyz" },
          { text: "Model Context Protocol",                  url: "https://modelcontextprotocol.io" },
        ],
        upstream: "canned (DuckDuckGo unreachable)",
      };
    },
  },
  {
    id:           "demo_echo",
    name:         "Demo Echo (httpbin.org, free)",
    provider:     "LemonCake DEMO → httpbin.org",
    type:         "API",
    pricePerCall: "0.00 USDC (free demo, real upstream)",
    description:  "Echoes your request via httpbin.org/anything. Returns headers, query params, and body — useful to verify your call_service request shape against a real HTTP server.",
    example:      { path: "/anything", method: "POST", body: { hello: "world" } },
    handler: async (path, body) => {
      const data = await tryFetch(`https://httpbin.org/anything${path}`, {
        method:  body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body:    body ? JSON.stringify(body) : undefined,
      });
      if (data) return { ...(data as object), upstream: "httpbin.org (real)" };
      return { receivedPath: path, receivedBody: body ?? null, timestamp: new Date().toISOString(), upstream: "canned (httpbin unreachable)" };
    },
  },
  {
    id:           "demo_fx",
    name:         "Demo FX rates (open.er-api.com, free)",
    provider:     "LemonCake DEMO → open.er-api.com",
    type:         "API",
    pricePerCall: "0.00 USDC (free demo, real upstream)",
    description:  "Real USD-base FX rates from open.er-api.com (free, no auth). Returns 160+ currencies updated daily.",
    example:      { path: "/latest", method: "GET" },
    handler: async () => {
      const data = await tryFetch("https://open.er-api.com/v6/latest/USD") as any;
      if (data && data.rates) {
        return {
          base:    data.base_code ?? "USD",
          rates:   { JPY: data.rates.JPY, EUR: data.rates.EUR, GBP: data.rates.GBP, CNY: data.rates.CNY, KRW: data.rates.KRW },
          asOf:    data.time_last_update_utc ?? null,
          upstream: "open.er-api.com (real)",
        };
      }
      return { base: "USD", rates: { JPY: 150.42, EUR: 0.92, GBP: 0.79, CNY: 7.12 }, asOf: new Date().toISOString().slice(0, 10), upstream: "canned (er-api unreachable)" };
    },
  },
];

function findDemoService(id: string) {
  return DEMO_SERVICES.find((s) => s.id === id);
}

const DEMO_NOTICE = "🎮 DEMO MODE — no real charge, no real upstream. Set LEMON_CAKE_PAY_TOKEN / LEMON_CAKE_BUYER_JWT to call real services. Run the `setup` tool for instructions.";

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
console.error(`[LemonCake MCP]   MODE        : ${DEMO_MODE ? "🎮 DEMO (try-without-signup; demo_* services + mock balance)" : "LIVE"}`);

if (DEMO_MODE) {
  console.error("[LemonCake MCP]");
  console.error("[LemonCake MCP]   🎮 Demo mode active — you can try these without any signup:");
  console.error("[LemonCake MCP]     • list_services      → see real marketplace + 3 demo services");
  console.error("[LemonCake MCP]     • call_service       → demo_search (DuckDuckGo) / demo_echo (httpbin) / demo_fx (open.er-api) — real upstreams, no auth");
  console.error("[LemonCake MCP]     • check_balance      → returns a mock $1.00 demo balance");
  console.error("[LemonCake MCP]     • check_tax / get_service_stats → real (no auth needed)");
  console.error("[LemonCake MCP]");
  console.error(`[LemonCake MCP]   For real calls, create a free account → ${REGISTER_URL}`);
} else if (!hasPayToken || !hasBuyerJwt) {
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

/**
 * サービス名から呼び方ヒントを返す。
 * エージェントが call_service で正しい path/method/body を即座に推測できるよう
 * 既知の人気サービスについて推奨呼び出しを示す。
 */
function usageHintFor(name: string): { path: string; method: string; body?: unknown; description: string } | undefined {
  const n = name.toLowerCase();
  if (n.includes("serper"))           return { path: "/search",       method: "POST", body: { q: "<query>", num: 5 },               description: "Google検索 (organic, news, images, knowledge graph)" };
  if (n.includes("hunter"))           return { path: "/domain-search?domain=<domain>&limit=5", method: "GET",                       description: "ドメインから企業の連絡先メール一覧 (役職・信頼度付き)" };
  if (n.includes("jina"))             return { path: "/?url=<url>",   method: "GET",                                                 description: "Webページを LLM-ready Markdown に変換" };
  if (n.includes("firecrawl"))        return { path: "/scrape",       method: "POST", body: { url: "<url>" },                       description: "JS実行ありのWebスクレイピング → Markdown" };
  if (n.includes("ipinfo"))           return { path: "/<ip>",         method: "GET",                                                 description: "IP geolocation・ISP・ASN・risk score" };
  if (n.includes("exchange") || n.includes("為替")) return { path: "/latest.json", method: "GET",                                    description: "USD基準の170+通貨レート (1日1回更新)" };
  if (n.includes("slack"))            return { path: "/chat.postMessage", method: "POST", body: { channel: "<id>", text: "<msg>" }, description: "Slackメッセージ送信、人間の判断仰ぎに最適" };
  if (n.includes("gbiz") || n.includes("法人")) return { path: "/hojin/<corporate_number>", method: "GET",                            description: "経産省 gBizINFO 法人情報 (法人番号13桁)" };
  if (n.includes("インボイス") || n.includes("invoice")) return { path: "/check?id=T<13桁>", method: "GET",                            description: "国税庁 適格請求書発行事業者番号の照合" };
  if (n.includes("e-gov") || n.includes("法令")) return { path: "/keyword?keyword=<語>", method: "GET",                                description: "日本の法律・政令・省令を全文検索" };
  if (n.includes("vat") || n.includes("abstract")) return { path: "/validate?vat_number=<vat>", method: "GET",                        description: "EU VAT番号有効性検証" };
  if (n.includes("coze") || n.includes("test")) return { path: "/anything", method: "POST", body: { test: "any" },                   description: "Echoサーバ (リクエストをそのまま200で返す、デバッグ用)" };
  return undefined;
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
        "If no auth env vars are set, the server is in DEMO MODE: list_services returns",
        "three demo services (demo_search / demo_echo / demo_fx) and call_service / check_balance",
        "respond with mock data so you can verify integration before signing up.",
        "",
        "Returns the current credential status (Pay Token / Buyer JWT), demo-mode flag, and",
        "step-by-step instructions to obtain anything that is missing, including a sample MCP",
        "client config snippet ready to paste.",
        "",
        "Returns: { version, apiUrl, mode, credentials, availableTools, setupSteps, register, dashboard, docs }",
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
        "DEMO MODE: when no auth env vars are set, three demo services are prepended",
        "(demo_search, demo_echo, demo_fx) so you can try call_service without signing up.",
        "",
        "Each item: { id, name, provider, type ('API' | 'MCP'), pricePerCall, [usage], [mode] }.",
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

    // ─── call_service（PAY_TOKEN 必須 / demo_* は不要） ─────────────────
    {
      name: "call_service",
      description: [
        "Invoke an upstream API service through LemonCake's pay-per-call proxy.",
        "Each successful call automatically charges USDC against your configured Pay Token.",
        "",
        "PRECONDITIONS:",
        "  • LEMON_CAKE_PAY_TOKEN env var must be set for real services. If missing, the tool",
        "    returns a structured CREDENTIAL_MISSING error with how-to-fix steps.",
        "  • DEMO MODE: serviceId values starting with `demo_` (demo_search / demo_echo / demo_fx)",
        "    work WITHOUT any auth and return canned responses — useful for Glama Inspector",
        "    or new-user trial. They are clearly marked with `mode: \"demo\"` and incur no charge.",
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

    // ─── check_balance（BUYER_JWT 必須 / DEMO_MODE 時は mock） ───────────
    {
      name: "check_balance",
      description: [
        "Check the current USDC balance, KYC tier, and account info of the configured buyer.",
        "",
        "PRECONDITIONS:",
        "  • LEMON_CAKE_BUYER_JWT env var must be set. If missing AND no PAY_TOKEN is set,",
        "    DEMO MODE returns a canned $1.00 demo balance with kycTier=\"DEMO\" so trial users",
        "    see something instead of an error. With PAY_TOKEN set but no BUYER_JWT, returns",
        "    a structured CREDENTIAL_MISSING error.",
        "",
        "Use BEFORE call_service to confirm sufficient funds, especially before a long batch.",
        "",
        "Returns: { balanceUsdc, kycTier, email, name, [mode], [note] }",
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
          mode:          DEMO_MODE ? "demo" : "live",
          credentials:   status,
          availableTools: DEMO_MODE
            ? {
                noAuth:        ["setup", "list_services", "get_service_stats", "check_tax", "check_balance (mock)", "call_service (demo_* only)"],
                demoServices:  DEMO_SERVICES.map((d) => d.id),
                upgradeHint:   "Set LEMON_CAKE_PAY_TOKEN to call real services; set LEMON_CAKE_BUYER_JWT for real balance.",
              }
            : {
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
        const real = services
          .filter((s: any) => s.verified)
          .map((s: any) => ({
            id:           s.id,
            name:         s.name,
            provider:     s.providerName,
            type:         s.type,
            pricePerCall: `${s.pricePerCallUsdc} USDC`,
            usage:        usageHintFor(s.name),
          }));
        // Demo mode: surface demo services first so Glama Inspector users
        // can try call_service without auth.
        if (DEMO_MODE) {
          const demos = DEMO_SERVICES.map((d) => ({
            id:           d.id,
            name:         d.name,
            provider:     d.provider,
            type:         d.type,
            pricePerCall: d.pricePerCall,
            description:  d.description,
            usage:        d.example,
            mode:         "demo",
          }));
          return json([...demos, ...real]);
        }
        return json(real);
      }

      // ─── call_service ────────────────────────────────────────────────────
      case "call_service": {
        const serviceId      = args.serviceId as string;
        const subPath        = (args.path as string | undefined) ?? "/";
        const method         = (args.method as string | undefined) ?? "GET";
        const body           = args.body as Record<string, unknown> | undefined;
        const idempotencyKey = args.idempotencyKey as string | undefined;

        const normalizedPath = subPath.startsWith("/") ? subPath : `/${subPath}`;

        // Demo mode: handle demo_* services without auth so Glama Inspector
        // and new users can verify the call shape before signing up.
        const demoSvc = findDemoService(serviceId);
        if (demoSvc) {
          return json({
            status:     200,
            chargeId:   `demo_${Date.now().toString(36)}`,
            amountUsdc: demoSvc.pricePerCall.split(" ")[0],
            response:   await demoSvc.handler(normalizedPath, body),
            mode:       "demo",
            note:       DEMO_NOTICE,
          });
        }

        if (!PAY_TOKEN) return credentialError("LEMON_CAKE_PAY_TOKEN", "call_service");
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
        const result: Record<string, unknown> = { status: res.status, chargeId, amountUsdc, response: responseBody };

        // よくある 4xx に対するエージェント向けヒントを付与
        if (res.status >= 400) {
          let hint: string | undefined;
          const bodyStr = typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody ?? "");
          if (res.status === 401)                               hint = "Upstream authentication failed. The service's API key may be invalid or expired. Try a different service.";
          else if (res.status === 402)                          hint = "Pay Token limit exhausted or buyer balance insufficient. Stop further calls and notify the user to top up.";
          else if (res.status === 403)                          hint = "Forbidden. Token scope may not match this serviceId, or service is not approved.";
          else if (res.status === 404)                          hint = "Path not found on upstream. Re-check the `path` argument — common shapes vary by service.";
          else if (res.status === 422 && bodyStr.includes("service_uneconomical")) hint = "This service is below the platform's minimum revenue floor. Cannot be called regardless of buyer balance.";
          else if (res.status === 429)                          hint = "Upstream rate-limited. Retry after backoff or pick a different service.";
          else if (res.status === 501)                          hint = "Service has no proxy endpoint configured. Pick a different service from list_services.";
          else if (res.status >= 500)                           hint = "Upstream server error. Retry once with the same idempotencyKey, then escalate or switch service.";
          if (hint) result.hint = hint;
        }

        return json(result);
      }

      // ─── check_balance ───────────────────────────────────────────────────
      case "check_balance": {
        if (!BUYER_JWT) {
          if (DEMO_MODE) return json({
            balanceUsdc: "1.00",
            kycTier:     "DEMO",
            email:       "demo@lemoncake.xyz",
            name:        "Demo Buyer",
            mode:        "demo",
            note:        DEMO_NOTICE,
          });
          return credentialError("LEMON_CAKE_BUYER_JWT", "check_balance");
        }
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
