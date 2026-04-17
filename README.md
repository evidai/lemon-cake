# 🍋 LemonCake

**Give your AI agent a wallet.**

> JWT-based Pay Tokens + USDC balance management for autonomous Machine-to-Machine payments.

[![License: Proprietary](https://img.shields.io/badge/license-proprietary-red.svg)](https://lemoncake.xyz)
[![MCP Compatible](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io)
[![npm: lemon-cake-mcp](https://img.shields.io/npm/v/lemon-cake-mcp?label=lemon-cake-mcp)](https://www.npmjs.com/package/lemon-cake-mcp)
[![npm: eliza-plugin-lemoncake](https://img.shields.io/npm/v/eliza-plugin-lemoncake?label=eliza-plugin-lemoncake)](https://www.npmjs.com/package/eliza-plugin-lemoncake)

---

## What is LemonCake?

LLM agents are getting powerful — but they still can't *pay for things* autonomously.

LemonCake solves this with **Pay Tokens**: short-lived JWTs that give an agent a scoped spending limit. The agent calls paid APIs through our proxy, gets charged per call in USDC, and stops automatically when the budget runs out.

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

## 🔌 Integrations

### MCP サーバー — `lemon-cake-mcp`

Claude Desktop・Cursor に **`npx` 一発**で接続できる公式 MCP サーバー。

```bash
npx lemon-cake-mcp
```

**`claude_desktop_config.json` に追記するだけ：**

```json
{
  "mcpServers": {
    "lemon-cake": {
      "command": "npx",
      "args": ["-y", "lemon-cake-mcp"],
      "env": {
        "LEMON_CAKE_PAY_TOKEN": "<Pay Token JWT>",
        "LEMON_CAKE_BUYER_JWT": "<Buyer JWT>"
      }
    }
  }
}
```

| ツール | 説明 |
|---|---|
| `setup` | 認証状態の確認と設定手順のガイド（認証不要）|
| `list_services` | マーケットプレイスの承認済み API 一覧を取得 |
| `call_service` | Pay Token で課金 API をプロキシ呼び出し |
| `check_balance` | USDC 残高・KYC ティアを確認 |

---

### Eliza v2 プラグイン — `eliza-plugin-lemoncake`

`@elizaos/core` v2 対応の公式プラグイン。**`character.plugins` に追加するだけ**で Eliza エージェントが自律決済を実行できます。

```bash
npm install eliza-plugin-lemoncake
```

```typescript
import { lemonCakePlugin } from "eliza-plugin-lemoncake";

const character = {
  name: "MyAgent",
  plugins: [lemonCakePlugin],
};
```

```env
# どちらか一方を設定
LEMONCAKE_PAY_TOKEN=eyJhbGci...   # クイックスタート（事前発行トークン）
LEMONCAKE_BUYER_JWT=eyJhbGci...   # 本番運用（呼び出しごとに都度発行）
```

**自然言語でそのまま動く：**
```
"LemonCake の demo_search_api を 0.50 USDC で呼び出して"
"serviceId: svc_invoice に 0.10 USDC 支払いを実行して"
```

| アクション | 説明 |
|---|---|
| `EXECUTE_LEMONCAKE_PAYMENT` | メインアクション。serviceId + limitUsdc を指定して M2M 決済を実行 |
| `PAY_WITH_LEMONCAKE` / `M2M_PAYMENT` など | 自然言語トリガー用エイリアス（similes）|

→ 詳細: [`eliza-plugin-lemoncake/README.md`](./eliza-plugin-lemoncake/README.md)

---

## ✨ Features

### For AI Agents (Buyers)
- **Pay Token (JWT)** — Scoped, expiring spend authorization. One token per task or session.
- **402-first design** — Agents receive structured `402 Payment Required` errors with machine-readable codes when budget runs out.
- **Idempotency keys** — Prevent double charges on retries with `Idempotency-Key` header (auto-assigned by plugins).
- **Real-time balance** — Check remaining USDC before committing to expensive calls.

### For API Providers (Sellers)
- **Service registry** — Register any REST API. Set price-per-call in USDC.
- **Instant revenue** — Get paid per call with no invoicing, no net-30, no chargebacks.
- **Usage analytics** — See call counts, revenue, and error rates per service.

### Infrastructure
- **JPYC on-chain deposit** — Charge balance with JPYC (Polygon ERC-20). Auto-verified via TX hash.
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
   MCP / Eliza                   Upstream APIs
   (Claude, Cursor, Eliza...)    (registered services)
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
```

### Tokens (Pay Token)

```http
POST /api/tokens
Authorization: Bearer <buyer_jwt>
{
  "serviceId": "<id>",
  "limitUsdc": "5.00",
  "buyerTag": "my-agent-session-42",
  "expiresAt": "2026-05-01T00:00:00Z"
}
→ { "tokenId": "...", "jwt": "<pay_token>", "limitUsdc": "5.000000", "expiresAt": "..." }
```

### Proxy (Pay-per-call)

```http
ANY /api/proxy/<serviceId>/<upstream-path>
Authorization: Bearer <pay_token>
Idempotency-Key: <uuid>

→ upstream response
  + X-Charge-Id: ch_...
  + X-Amount-Usdc: 0.001000
```

Error responses:
```json
{ "error": "Token limit exceeded", "used": "4.999", "limit": "5.000" }   // 402
{ "error": "Insufficient balance: 1.23 USDC available" }                 // 402
{ "error": "Token expired" }                                              // 401
```

### Services

```http
GET /api/services?reviewStatus=APPROVED&limit=50
→ [{ "id": "...", "name": "...", "pricePerCallUsdc": "0.001", ... }]
```

---

## 🧑‍💻 Local Development

```bash
# 1. Clone
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake

# 2. API server
cd api
cp .env.example .env
npm install && npx prisma migrate dev
npm run dev                    # http://localhost:3000

# 3. Dashboard
cd ../dashboard
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:3000
npm install && npm run dev     # http://localhost:3001

# 4. MCP server
cd ../mcp-server
npm install && npm run build

# 5. Eliza plugin
cd ../eliza-plugin-lemoncake
npm install && npm run build
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

---

## 📄 License

Proprietary — All rights reserved © 2026 LemonCake  
MCP server and Eliza plugin source are available for review. Core API and payment engine are closed source.

---

*Built for the agentic web. [lemoncake.xyz](https://lemoncake.xyz)*
