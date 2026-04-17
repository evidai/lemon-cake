#!/usr/bin/env node
/**
 * LEMONCake MCP Server
 *
 * Gives AI agents access to the Lemon Cake payment infrastructure:
 *  - list_services      : Browse approved APIs on the marketplace
 *  - call_service       : Pay-per-call proxy to any registered service
 *  - check_balance      : Check remaining USDC balance
 *  - check_tax          : Japan tax compliance (invoice + withholding)
 *  - get_service_stats  : Usage & revenue stats per service
 *
 * Environment variables:
 *  LEMON_CAKE_API_URL   : Base URL of the API  (e.g. https://skillful-blessing-production.up.railway.app)
 *  LEMON_CAKE_PAY_TOKEN : Pay Token JWT issued from /api/tokens  (for call_service)
 *  LEMON_CAKE_BUYER_JWT : Buyer JWT from /api/auth/buyer-login    (for check_balance)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL   = (process.env.LEMON_CAKE_API_URL   ?? "https://skillful-blessing-production.up.railway.app").replace(/\/$/, "");
const PAY_TOKEN = process.env.LEMON_CAKE_PAY_TOKEN  ?? "";
const BUYER_JWT = process.env.LEMON_CAKE_BUYER_JWT  ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiGet(path: string, auth?: string) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
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
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function json(data: unknown) {
  return ok(JSON.stringify(data, null, 2));
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "lemon-cake", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_services",
      description:
        "List approved services available on the Lemon Cake marketplace. Each service has an id, name, type (API|MCP), and price per call in USDC.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max number of services to return (default 50, max 100)",
          },
        },
      },
    },
    {
      name: "call_service",
      description:
        "Call a registered service through the Lemon Cake pay-per-call proxy. Automatically charges the configured Pay Token for each call. Returns the upstream API response plus charge metadata (chargeId, amountUsdc).",
      inputSchema: {
        type: "object",
        properties: {
          serviceId: {
            type: "string",
            description: "ID of the service to call (from list_services)",
          },
          path: {
            type: "string",
            description: "Sub-path to append after the service base URL, e.g. \"/search\" or \"/v1/completions\"",
            default: "/",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method (default GET)",
            default: "GET",
          },
          body: {
            type: "object",
            description: "Request body (for POST/PUT/PATCH)",
          },
          idempotencyKey: {
            type: "string",
            description: "Optional idempotency key to prevent duplicate charges. Use a unique UUID per logical operation.",
          },
        },
        required: ["serviceId"],
      },
    },
    {
      name: "check_balance",
      description:
        "Check the current USDC balance and KYC tier of the configured buyer account. Requires LEMON_CAKE_BUYER_JWT to be set.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "check_tax",
      description:
        "Japan tax compliance check. Validates an invoice registration number (適格請求書) and determines withholding tax requirements for a transaction. Returns verdict on invoice validity and whether withholding tax applies.",
      inputSchema: {
        type: "object",
        properties: {
          registrationNumber: {
            type: "string",
            description: "Qualified invoice registration number (e.g. T1234567890123)",
          },
          serviceDescription: {
            type: "string",
            description: "Description of the service/work for withholding tax determination",
          },
          grossAmountJpy: {
            type: "number",
            description: "Gross transaction amount in JPY",
          },
        },
        required: ["registrationNumber", "serviceDescription", "grossAmountJpy"],
      },
    },
    {
      name: "get_service_stats",
      description:
        "Get public usage statistics for all services: charge count, total revenue (USDC), and last charge timestamp. Useful for evaluating service popularity before choosing which to call.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    switch (name) {
      // ── list_services ──────────────────────────────────────────────────────
      case "list_services": {
        const limit = (args.limit as number | undefined) ?? 50;
        const services = await apiGet(`/api/services?reviewStatus=APPROVED&limit=${limit}`);
        const summary = (services as any[]).map((s: any) => ({
          id:               s.id,
          name:             s.name,
          provider:         s.providerName,
          type:             s.type,
          pricePerCall:     `${s.pricePerCallUsdc} USDC`,
          endpoint:         s.endpoint ?? "(no public endpoint)",
        }));
        return json(summary);
      }

      // ── call_service ───────────────────────────────────────────────────────
      case "call_service": {
        if (!PAY_TOKEN) throw new Error("LEMON_CAKE_PAY_TOKEN is not set");

        const serviceId     = args.serviceId as string;
        const subPath       = (args.path as string | undefined) ?? "/";
        const method        = (args.method as string | undefined) ?? "GET";
        const body          = args.body as Record<string, unknown> | undefined;
        const idempotencyKey = args.idempotencyKey as string | undefined;

        const normalizedPath = subPath.startsWith("/") ? subPath : `/${subPath}`;
        const url = `${API_URL}/api/proxy/${serviceId}${normalizedPath}`;

        const headers: Record<string, string> = {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${PAY_TOKEN}`,
        };
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

        const fetchOptions: RequestInit = { method, headers };
        if (body && ["POST", "PUT", "PATCH"].includes(method)) {
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);
        const chargeId    = res.headers.get("X-Charge-Id");
        const amountUsdc  = res.headers.get("X-Amount-Usdc");

        let responseBody: unknown;
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          responseBody = await res.json();
        } else {
          responseBody = await res.text();
        }

        return json({
          status:       res.status,
          chargeId,
          amountUsdc,
          response:     responseBody,
        });
      }

      // ── check_balance ──────────────────────────────────────────────────────
      case "check_balance": {
        if (!BUYER_JWT) throw new Error("LEMON_CAKE_BUYER_JWT is not set");
        const me = await apiGet("/api/auth/me", BUYER_JWT);
        return json({
          balanceUsdc: me.buyer?.balanceUsdc ?? me.balanceUsdc,
          kycTier:     me.buyer?.kycTier     ?? me.kycTier,
          email:       me.email,
          name:        me.name,
        });
      }

      // ── check_tax ─────────────────────────────────────────────────────────
      case "check_tax": {
        const result = await apiPost("/api/tax/full-check", {
          registrationNumber: args.registrationNumber,
          serviceDescription: args.serviceDescription,
          grossAmountJpy:     args.grossAmountJpy,
        });
        return json(result);
      }

      // ── get_service_stats ─────────────────────────────────────────────────
      case "get_service_stats": {
        const stats = await apiGet("/api/services/stats");
        return json(stats);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Lemon Cake MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
