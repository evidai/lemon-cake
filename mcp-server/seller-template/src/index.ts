#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         LEMONCake Seller MCP Server Template                    ║
 * ║                                                                  ║
 * ║  このテンプレートをコピーして、あなたのAPIをMCPサーバーとして    ║
 * ║  LEMONCakeマーケットプレイスに登録しましょう。                   ║
 * ║                                                                  ║
 * ║  カスタマイズ手順:                                               ║
 * ║    1. SERVICE_NAME / SERVICE_VERSION を変更                      ║
 * ║    2. tools リストにあなたのAPIのツールを定義                    ║
 * ║    3. switch (name) の各ケースに実装を追加                       ║
 * ║    4. npm run build && npm publish                                ║
 * ║    5. LEMONCakeダッシュボードでサービスを登録                    ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * 環境変数:
 *   YOUR_API_KEY       : あなたのAPIの認証キー
 *   YOUR_API_BASE_URL  : APIのベースURL（デフォルト: https://api.your-service.com）
 *   LEMONCAKE_SECRET   : LEMONCakeが発行するWebhook検証シークレット（任意）
 *   PORT               : HTTPモード時のポート番号（デフォルト: 3100）
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── 設定 ─────────────────────────────────────────────────────────────────────

const SERVICE_NAME    = "your-service";       // ← 変更してください
const SERVICE_VERSION = "1.0.0";

const API_KEY      = process.env.YOUR_API_KEY      ?? "";
const API_BASE_URL = (process.env.YOUR_API_BASE_URL ?? "https://api.your-service.com").replace(/\/$/, "");

// ── ヘルパー ──────────────────────────────────────────────────────────────────

/** JSON レスポンスを返す */
function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** テキストレスポンスを返す */
function text(msg: string) {
  return { content: [{ type: "text" as const, text: msg }] };
}

/** エラーレスポンスを返す（isError: true でエージェントがエラーと判断できる） */
function error(msg: string, code?: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: msg, code }) }],
    isError: true,
  };
}

/**
 * あなたのAPIを呼び出す汎用ヘルパー
 * 401/402/429 を適切にハンドリングする
 */
async function callApi(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "X-Source":      "lemoncake-mcp",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = await res.text();
  }

  return { ok: res.ok, status: res.status, data };
}

// ── MCPサーバー初期化 ─────────────────────────────────────────────────────────

const server = new Server(
  { name: SERVICE_NAME, version: SERVICE_VERSION },
  { capabilities: { tools: {} } },
);

// ── ツール定義 ────────────────────────────────────────────────────────────────
//
// description はLLMが読む。「このツールは何をするのか」「いつ使うべきか」を
// 明確に書くことで、エージェントが適切なタイミングで呼び出せる。
//
// inputSchema は JSON Schema 形式。description は全フィールドに書くこと。

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [

    // ─── ツール1: 検索 ──────────────────────────────────────────────────────
    // ↓ ここをあなたのAPIの主要機能に合わせて書き換える
    {
      name: "search",
      description: `
        [あなたのサービス名] で検索します。

        使うべき場面:
        - ユーザーが情報を探しているとき
        - 特定のキーワードに関連するコンテンツが必要なとき

        返り値: 関連度スコア付きの結果リスト。score が高いほど関連性が高い。

        料金: 1コール = $0.001 USDC
      `.trim(),
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "検索クエリ。自然言語でも、キーワードでも可。日本語・英語対応。",
          },
          limit: {
            type: "number",
            description: "返す件数（デフォルト10、最大100）",
            default: 10,
          },
          filters: {
            type: "object",
            description: "絞り込み条件（任意）",
            properties: {
              language: {
                type: "string",
                enum: ["ja", "en", "any"],
                description: "言語フィルタ（デフォルト: any）",
              },
              dateFrom: {
                type: "string",
                description: "この日付以降 (YYYY-MM-DD)",
              },
            },
          },
        },
      },
    },

    // ─── ツール2: 詳細取得 ──────────────────────────────────────────────────
    {
      name: "get_item",
      description: `
        IDを指定してアイテムの詳細を取得します。

        使うべき場面:
        - search で見つけたアイテムの全文・詳細情報が必要なとき

        引数の id は search レスポンスの results[].id から取得できます。

        料金: 1コール = $0.0005 USDC
      `.trim(),
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: {
            type: "string",
            description: "アイテムID（searchレスポンスの results[].id）",
          },
        },
      },
    },

    // ─── ツール3: サービス情報（課金なし） ─────────────────────────────────
    {
      name: "get_service_info",
      description: `
        このサービスの情報と利用可能な機能一覧を返します。
        このツールは課金されません。
        エージェントが最初に呼び出してサービスの全容を把握するために使います。
      `.trim(),
      inputSchema: {
        type: "object",
        properties: {},
      },
    },

    // ─── ここに追加のツールを定義 ──────────────────────────────────────────
    // {
    //   name: "your_tool_name",
    //   description: "...",
    //   inputSchema: { type: "object", properties: { ... } }
    // },

  ],
}));

// ── ツール実装 ────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  if (!API_KEY) {
    return error("YOUR_API_KEY environment variable is not set", "CONFIGURATION_ERROR");
  }

  try {
    switch (name) {

      // ─── search ───────────────────────────────────────────────────────────
      case "search": {
        const query   = args.query as string;
        const limit   = (args.limit as number | undefined) ?? 10;
        const filters = args.filters as Record<string, unknown> | undefined;

        if (!query?.trim()) {
          return error("query must not be empty", "INVALID_PARAMETER");
        }

        // ↓ あなたのAPIエンドポイントに書き換える
        const result = await callApi("/search", {
          method: "POST",
          body: { query, limit, filters },
        });

        if (!result.ok) {
          return handleApiError(result.status, result.data);
        }

        return json(result.data);
      }

      // ─── get_item ─────────────────────────────────────────────────────────
      case "get_item": {
        const id = args.id as string;
        if (!id?.trim()) {
          return error("id is required", "INVALID_PARAMETER");
        }

        // ↓ あなたのAPIエンドポイントに書き換える
        const result = await callApi(`/items/${encodeURIComponent(id)}`);

        if (!result.ok) {
          return handleApiError(result.status, result.data);
        }

        return json(result.data);
      }

      // ─── get_service_info ─────────────────────────────────────────────────
      case "get_service_info": {
        return json({
          name:        SERVICE_NAME,
          version:     SERVICE_VERSION,
          description: "あなたのサービスの説明をここに書く",
          tools: [
            { name: "search",           pricePerCall: "$0.001 USDC",   description: "コンテンツを検索" },
            { name: "get_item",         pricePerCall: "$0.0005 USDC",  description: "アイテム詳細取得" },
            { name: "get_service_info", pricePerCall: "無料",           description: "このサービス情報" },
          ],
          rateLimit: {
            requestsPerMinute: 60,
            requestsPerDay:    10000,
          },
          supportedLanguages: ["ja", "en"],
        });
      }

      // ─── 追加ツールの実装はここに ────────────────────────────────────────
      // case "your_tool_name": {
      //   const param = args.param as string;
      //   const result = await callApi("/your-endpoint", { method: "POST", body: { param } });
      //   if (!result.ok) return handleApiError(result.status, result.data);
      //   return json(result.data);
      // }

      default:
        return error(`Unknown tool: ${name}`, "UNKNOWN_TOOL");
    }

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${SERVICE_NAME}] Tool error (${name}):`, msg);
    return error(`Internal error: ${msg}`, "INTERNAL_ERROR");
  }
});

// ── エラーハンドラー ──────────────────────────────────────────────────────────

function handleApiError(status: number, body: unknown) {
  const msg = typeof body === "object" && body !== null && "error" in body
    ? String((body as { error: unknown }).error)
    : String(body);

  switch (status) {
    case 400: return error(`Bad request: ${msg}`, "INVALID_PARAMETER");
    case 401: return error("API authentication failed. Check YOUR_API_KEY.", "UNAUTHORIZED");
    case 404: return error(`Not found: ${msg}`, "NOT_FOUND");
    case 429: return error(`Rate limit exceeded. Please wait before retrying.`, "RATE_LIMITED");
    case 500:
    case 502:
    case 503: return error(`Upstream API error (${status}): ${msg}`, "UPSTREAM_ERROR");
    default:  return error(`API error ${status}: ${msg}`, "API_ERROR");
  }
}

// ── サーバー起動 ──────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVICE_NAME}] MCP server v${SERVICE_VERSION} running on stdio`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
