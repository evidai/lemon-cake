# 🍋 LEMONCake

**Give your AI agent a wallet.**

> JWT-based Pay Tokens + USDC balance management for autonomous Machine-to-Machine payments.

[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](https://lemoncake.xyz)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)
[![Built with Hono](https://img.shields.io/badge/API-Hono-orange.svg)](https://hono.dev)
[![Deployed on Railway](https://img.shields.io/badge/deployed-Railway-blueviolet.svg)](https://railway.app)

---

## What is LEMONCake?

LLM agents are getting powerful — but they still can't *pay for things* autonomously.

LEMONCake solves this with **Pay Tokens**: short-lived JWTs that give an agent a scoped spending limit. The agent calls paid APIs through our proxy, gets charged per call in USDC, and stops automatically when the budget runs out.

```
You                    Agent                   Paid API
 │                       │                        │
 ├─ issue Pay Token ──▶  │                        │
 │   limit: $2.00        │                        │
 │                       ├─ call /api/proxy ────▶ │
 │                       │   Authorization: Bearer <pay_token>
 │                       │                        │
 │                       │  ◀─ response + charge ─┤
 │                       │    X-Charge-Id: ch_...  │
 │                       │    X-Amount-Usdc: 0.001 │
 │                       │                        │
 │                       ├─ (budget exhausted)     │
 │                       │   402 Payment Required  │
 │                       ✗   agent stops cleanly   │
```

---

## ⚡ Quickstart — Claude Desktop (MCP)

Add LEMONCake as an MCP server and your Claude agent can browse services, check its balance, and call paid APIs — all in natural language.

**Step 1: Get credentials**

1. Sign up at [lemoncake.xyz](https://lemoncake.xyz)
2. Add USDC balance via JPYC deposit
3. Issue a Pay Token from the dashboard (set a spending limit)
4. Copy your Buyer JWT from Settings

**Step 2: Add to `claude_desktop_config.json`**

```json
{
  "mcpServers": {
    "lemon-cake": {
      "command": "npx",
      "args": ["-y", "lemon-cake-mcp"],
      "env": {
        "LEMON_CAKE_PAY_TOKEN": "<your Pay Token JWT>",
        "LEMON_CAKE_BUYER_JWT": "<your Buyer JWT>"
      }
    }
  }
}
```

**Step 3: Ask Claude anything**

```
"What paid APIs are available on LEMONCake?"
"Check my USDC balance"
"Search for 会社名 using the gBizINFO corporate lookup"
"Validate invoice number T1234567890123"
```

That's it. No code required.

---

## 🛠 MCP Tools

| Tool | Description |
|------|-------------|
| `list_services` | Browse all approved APIs on the marketplace |
| `call_service` | Pay-per-call proxy to any registered service |
| `check_balance` | Check remaining USDC balance and KYC tier |
| `check_tax` | Japan tax compliance — invoice validation + withholding check |
| `get_service_stats` | Usage & revenue stats across all services |

### Example: call a service

```
list_services → find a service you want → call_service with its ID
```

The agent handles the Pay Token automatically. Each call deducts from the configured limit. At $0.00 remaining, the agent receives a `402` and stops — no runaway billing.

---

## ✨ Features

### For AI Agents (Buyers)
- **Pay Token (JWT)** — Scoped, expiring spend authorization. One token per task or session.
- **402-first design** — Agents receive structured `402 Payment Required` errors with machine-readable codes when budget runs out.
- **Idempotency keys** — Prevent double charges on retries with `Idempotency-Key` header.
- **Real-time balance** — Check remaining USDC before committing to expensive calls.

### For API Providers (Sellers)
- **Service registry** — Register any REST API or MCP server. Set price-per-call in USDC.
- **Instant revenue** — Get paid per call with no invoicing, no net-30, no chargebacks.
- **Usage analytics** — See call counts, revenue, and error rates per service.

### For Compliance (Japan)
- **JPYC on-chain deposit** — Charge balance with JPYC (Polygon ERC-20). Auto-verified via TX hash.
- **Invoice validation** — Integrates with 国税庁 Web-API to verify qualified invoice numbers.
- **Withholding tax** — Automatic determination of 源泉徴収 requirements per transaction.
- **Accounting sync** — Auto-post journal entries to freee, QuickBooks, Xero, or Zoho.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    lemoncake.xyz                          │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐   ┌─────────────┐  │
│  │  Dashboard  │    │   Hono API   │   │  Pay Proxy  │  │
│  │  (Next.js)  │◀──▶│  + OpenAPI   │◀──│  Middleware │  │
│  └─────────────┘    └──────┬───────┘   └─────────────┘  │
│                            │                             │
│               ┌────────────┼────────────┐                │
│               ▼            ▼            ▼                │
│          PostgreSQL      Redis       Polygon             │
│          (Prisma)       (Queue)    USDC / JPYC           │
└──────────────────────────────────────────────────────────┘
        ▲                              ▲
        │                              │
   MCP Clients                   Upstream APIs
   (Claude, Cursor, etc.)        (freee, NTA, gBizINFO...)
```

**Key design decisions:**

- **EdDSA (Ed25519)** for JWT signing — 64-byte signatures, timing-attack resistant, RFC 8037
- **Optimistic locking** on `usedUsdc` — prevents double charges under concurrent agent calls
- **Proxy-first** — upstream API keys never leave the server; agents only hold Pay Tokens

---

## 🔌 Public API (selected endpoints)

> Full OpenAPI spec available at `/api/doc` after signing in.

### Auth

```http
POST /api/auth/register
{ "name": "string", "email": "string", "password": "string (min 8)" }
→ { "token": "<buyer_jwt>", "expiresIn": 2592000 }

POST /api/auth/buyer-login
{ "email": "string", "password": "string" }
→ { "token": "<buyer_jwt>" }

GET /api/auth/google          # Redirect to Google OAuth
POST /api/auth/google/callback
{ "code": "string", "state": "string" }
→ { "token": "<buyer_jwt>" }
```

### Tokens (Pay Token)

```http
POST /api/tokens
Authorization: Bearer <buyer_jwt>
{
  "serviceId": "<id>",
  "limitUsdc": "5.00",
  "buyerTag": "my-agent-session-42",   // optional, for audit logs
  "expiresAt": "2026-05-01T00:00:00Z"  // optional, default 30 days
}
→ { "tokenId": "...", "jwt": "<pay_token>", "limitUsdc": "5.000000", "expiresAt": "..." }
```

### Proxy (Pay-per-call)

```http
ANY /api/proxy/<serviceId>/<upstream-path>
Authorization: Bearer <pay_token>
Idempotency-Key: <uuid>   // optional

→ upstream response
  + X-Charge-Id: ch_...
  + X-Amount-Usdc: 0.001000
```

Error responses:
```json
// 402 – budget exhausted
{ "error": "Token limit exceeded", "used": "4.999", "limit": "5.000" }

// 402 – insufficient balance at token issuance
{ "error": "Insufficient balance: 1.23 USDC available" }

// 401 – token expired or revoked
{ "error": "Token expired" }
```

### Services

```http
GET /api/services?reviewStatus=APPROVED&limit=50
→ [{ "id": "...", "name": "...", "type": "API|MCP", "pricePerCallUsdc": "0.001", ... }]

GET /api/services/stats
→ [{ "serviceId": "...", "chargeCount": 1234, "totalUsdc": "1.234", "lastChargeAt": "..." }]
```

---

## 🧑‍💻 Local Development

```bash
# 1. Clone
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake

# 2. API server
cd api
cp .env.example .env          # Fill in DATABASE_URL, JWT secrets, etc.
npm install
npx prisma migrate dev
npm run dev                    # http://localhost:3000

# 3. Dashboard
cd ../dashboard
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:3000
npm install
npm run dev                    # http://localhost:3001

# 4. MCP server (optional)
cd ../mcp-server
npm install && npm run build
# Point LEMON_CAKE_API_URL=http://localhost:3000 in your MCP client config
```

### Seed demo data

```bash
node api/seed_demo.js
# Creates demo provider, 4 approved services, and 9,000+ sample charge records
```

---

## 🛡 Security

- **Brute-force protection** — 10 failed logins triggers a 15-minute lockout per email
- **Pay Token scoping** — Each token is bound to a single `serviceId`; cross-service reuse is rejected
- **No JWT storage** — Only the `jti` (token ID) is stored in the DB; the signed JWT never persists
- **CSRF protection** — OAuth state parameter with 10-minute TTL and single-use consumption
- **On-chain deposit verification** — JPYC transfers are verified against Polygon event logs before balance is credited

---

## 🗺 Roadmap

- [ ] KYC tier-based spending limits (Tier 0 → 3)
- [ ] Smart contract escrow for trustless settlement
- [ ] Streaming / token-count billing for LLM APIs
- [ ] Multi-chain support (Ethereum, Solana, Base)
- [ ] Agent-to-agent sub-token delegation UI
- [ ] `npx lemon-cake-mcp` zero-install MCP launcher

---

## 📄 License

Proprietary — All rights reserved © 2026 LEMONCake  
MCP server source is available for review. Core API and payment engine are closed source.

---

*Built for the agentic web. [lemoncake.xyz](https://lemoncake.xyz)*
