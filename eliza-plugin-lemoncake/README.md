# 🍋 eliza-plugin-lemoncake

[![npm version](https://img.shields.io/npm/v/eliza-plugin-lemoncake)](https://www.npmjs.com/package/eliza-plugin-lemoncake)
[![npm downloads](https://img.shields.io/npm/dm/eliza-plugin-lemoncake)](https://www.npmjs.com/package/eliza-plugin-lemoncake)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![ElizaOS v2](https://img.shields.io/badge/%40elizaos%2Fcore-%3E%3D2.0.0--alpha.1-blue)](https://elizaos.ai)

**Give your Eliza agent autonomous M2M payments (USDC / JPYC) in 3 minutes.**

Using [LemonCake](https://lemoncake.xyz?utm_source=eliza-plugin&utm_medium=npm-readme) JWT Pay Tokens, your AI agent can call paid upstream APIs without any human in the loop — with hard spending caps, idempotency, and a one-click kill switch.

> 🇯🇵 日本語版は [README.ja.md](./README.ja.md) を参照してください。

---

## 🚀 Get started in 3 minutes

You'll need a LemonCake account with a USDC balance.

1. **[Create a free account](https://lemoncake.xyz/register?utm_source=eliza-plugin&utm_medium=npm-readme&utm_campaign=onboard)** — email-only signup
2. **Top up** — minimum $5 USDC (JPYC also supported)
3. **Copy your Buyer JWT** from [Dashboard → API Keys](https://lemoncake.xyz/dashboard?utm_source=eliza-plugin&utm_medium=npm-readme)
4. `npm install eliza-plugin-lemoncake` and configure (below)

> 📚 [Full quickstart docs](https://lemoncake.xyz/docs/quickstart?utm_source=eliza-plugin&utm_medium=npm-readme)

---

## ✨ Features

- **Zero-friction install** — `npm install`, add to `character.plugins`, done
- **Two auth modes** — quickstart (pre-issued Pay Token) / production (dynamic issuance per call)
- **Spend-capped access** — Pay Tokens auto-stop once the USDC cap is hit
- **Natural-language triggers** — `serviceId` / `limitUsdc` are auto-extracted from agent messages (English + Japanese)
- **Idempotent by default** — a fresh UUID `Idempotency-Key` on every call
- **Eliza v2 compatible** — `@elizaos/core` v2.0.0-alpha.1+
- **Written in TypeScript** — type definitions shipped

---

## 📦 Install

```bash
npm install eliza-plugin-lemoncake
# or
pnpm add eliza-plugin-lemoncake
```

**Requires:** Node.js v23+

---

## 🚀 Setup

### Step 1: Add the plugin to your character

**TypeScript**

```typescript
import { lemoncakePlugin } from "eliza-plugin-lemoncake";

const character = {
  name: "MyAgent",
  plugins: [lemoncakePlugin],
  // ...
};
```

**character.json**

```json
{
  "name": "MyAgent",
  "plugins": ["eliza-plugin-lemoncake"]
}
```

---

### Step 2: Choose an auth mode

#### A. Quickstart mode (recommended)

Pre-issue a Pay Token in the [LemonCake dashboard](https://lemoncake.xyz/dashboard) and drop it into `.env`:

```env
LEMONCAKE_PAY_TOKEN=eyJhbGci...   # Pay Token JWT issued from the dashboard
```

> **What's a Pay Token?**
> A scoped access token bound to one service, with a USDC cap and expiry.
> Charges halt automatically once the cap is hit — perfect for safe agent delegation.

#### B. Production mode (dynamic issuance)

The agent mints a fresh Pay Token on every call. Use `limitUsdc` to control the per-call cap.

```env
LEMONCAKE_BUYER_JWT=eyJhbGci...   # Buyer JWT from Dashboard → Settings
```

> If both are set, **`LEMONCAKE_PAY_TOKEN` takes precedence**.

---

## 💡 Usage

### Natural-language trigger

Once configured, just talk to the agent — `EXECUTE_LEMONCAKE_PAYMENT` fires automatically.

```
Call LemonCake's demo_agent_search_api with a 0.50 USDC cap
```

```
Execute a 0.10 USDC payment against serviceId: svc_invoice_check
```

```
Pay with USDC to run the search API
```

> **How parameters are extracted**
> Eliza's LLM pulls `serviceId` / `limitUsdc` / `path` / `method` / `body` / `buyerTag`
> from the message (based on the `action.parameters` schema).
> If the LLM misses, a regex fallback runs against the raw text (e.g. `serviceId: xxx`, `0.50 USDC`).

### Calling the action from code

```typescript
import { payAction } from "eliza-plugin-lemoncake";

await payAction.handler(
  runtime,
  message,
  state,
  {
    parameters: {
      serviceId: "demo_agent_search_api",
      limitUsdc: "0.50",
      path:      "/search",
      method:    "POST",
      body:      JSON.stringify({ query: "AI agent payments" }),
      buyerTag:  "my-session-001",
    },
  },
  async (response) => {
    console.log(response.text);
  },
);
```

### Using `LemoncakeClient` directly

```typescript
import { LemoncakeClient, LemoncakeError } from "eliza-plugin-lemoncake";

const client = new LemoncakeClient({
  apiUrl:   "https://api.lemoncake.xyz",
  payToken: null,
  buyerJwt: process.env.LEMONCAKE_BUYER_JWT ?? null,
});

try {
  // 1. Resolve a Pay Token (skipped if LEMONCAKE_PAY_TOKEN is set)
  const jwt = await client.resolvePayToken({
    serviceId: "svc_invoice_check",
    limitUsdc: "0.10",
    buyerTag:  "my-agent",
  });

  // 2. Call the service
  const result = await client.callService(jwt, {
    serviceId: "svc_invoice_check",
    path:      "/check",
    method:    "POST",
    body:      { invoiceId: "INV-001" },
  });

  console.log("chargeId:", result.chargeId);
  console.log("amount:",   result.amountUsdc, "USDC");
  console.log("response:", result.response);

  // 3. Check balance
  const me = await client.getBalance();
  console.log("balance:", me.balanceUsdc, "USDC");

} catch (err) {
  if (err instanceof LemoncakeError) {
    console.error(err.code, err.message);
    if (err.retryable) console.log(`retry after ${err.retryAfterSec ?? 60}s`);
  }
}
```

---

## ⚙️ Action spec

**Action name:** `EXECUTE_LEMONCAKE_PAYMENT`

**Similes:** `PAY_WITH_LEMONCAKE` / `CALL_PAID_API` / `EXECUTE_PAYMENT` /
`ISSUE_PAY_TOKEN` / `M2M_PAYMENT` / `AUTONOMOUS_PAYMENT` / `USDC_PAYMENT`

### Parameters

| Parameter | Type | Required | Default | Description |
|---|---|:---:|---|---|
| `serviceId` | string | ✅ | — | Service ID from the LemonCake marketplace |
| `limitUsdc` | string | — | `"0.10"` | Spending cap in USDC, e.g. `"0.50"` |
| `path` | string | — | `"/"` | Subpath on the service, e.g. `"/search"` |
| `method` | string | — | `"POST"` | HTTP method (GET / POST / PUT / PATCH / DELETE) |
| `body` | string | — | — | Request body (JSON string) |
| `buyerTag` | string | — | `eliza-agent-{timestamp}` | Audit-log tag |

### Return value

```typescript
// Success
{ success: true, chargeId: string | null, amountUsdc: string | null }

// Failure
{ success: false, error: LemoncakeErrorCode, retryable?: boolean }
```

---

## 🔐 Environment variables

| Name | Required | Description |
|---|:---:|---|
| `LEMONCAKE_PAY_TOKEN` | △ | Pre-issued Pay Token JWT (quickstart mode) |
| `LEMONCAKE_BUYER_JWT` | △ | Buyer JWT (production / dynamic-issuance mode) |
| `LEMONCAKE_API_URL` | — | API endpoint (default: `https://api.lemoncake.xyz`) |

> △ = either `LEMONCAKE_PAY_TOKEN` or `LEMONCAKE_BUYER_JWT` must be set.
> If neither is present, the action's `validate()` returns `false` and it's disabled.

---

## ❌ Error codes

| Code | retryable | Description |
|---|:---:|---|
| `CREDENTIAL_MISSING` | — | Neither PAY_TOKEN nor BUYER_JWT is set |
| `INSUFFICIENT_BALANCE` | — | USDC balance too low |
| `TOKEN_LIMIT_EXCEEDED` | — | Pay Token cap reached |
| `TOKEN_EXPIRED` | — | Pay Token or Buyer JWT expired |
| `SERVICE_NOT_FOUND` | — | `serviceId` does not exist |
| `SERVICE_NOT_APPROVED` | — | Service is still under LemonCake review |
| `RATE_LIMITED` | ✅ | Rate-limited (wait `retryAfterSec` seconds) |
| `NETWORK_ERROR` | ✅ | Connection failure |
| `API_ERROR` | — | Other upstream API error |
| `PARSE_ERROR` | — | Response parse failure |

---

## 🏃 Local development

```bash
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake/eliza-plugin-lemoncake

npm install
npm run build   # TypeScript → dist/
```

---

## 📐 Architecture

```
eliza-plugin-lemoncake/
├── src/
│   ├── index.ts               # lemoncakePlugin export (Plugin object)
│   ├── types.ts               # type definitions + LemoncakeError class
│   ├── actions/
│   │   └── payAction.ts       # EXECUTE_LEMONCAKE_PAYMENT action
│   └── lib/
│       └── lemoncakeClient.ts # HTTP client (Pay Token issue + proxy call)
└── dist/                      # build output (npm publish target)
```

### Payment flow

```
Agent message
     │
     ▼
payAction.validate()
  └─ checks LEMONCAKE_PAY_TOKEN or LEMONCAKE_BUYER_JWT is set
     │
     ▼
payAction.handler()
  ├─ 1. LLM parameter extraction (options.parameters)
  │     └─ on miss: regex fallback against raw message text
  │
  ├─ 2. LemoncakeClient.resolvePayToken()
  │     ├─ LEMONCAKE_PAY_TOKEN set → use as-is (no API call)
  │     └─ LEMONCAKE_BUYER_JWT only → POST /api/tokens → mint Pay Token
  │
  ├─ 3. LemoncakeClient.callService()
  │     └─ ANY /api/proxy/:serviceId/:path
  │          Headers: Authorization: Bearer <payTokenJwt>
  │                   Idempotency-Key: <randomUUID>
  │
  └─ 4. response handling
        ├─ success: pull charge info from X-Charge-Id / X-Amount-Usdc headers
        └─ failure: LemoncakeErrorCode → human-readable message → callback
```

---

## 🔗 Links

- [LemonCake dashboard](https://lemoncake.xyz/dashboard)
- [LemonCake API docs](https://lemoncake.xyz/docs)
- [ElizaOS](https://elizaos.ai)
- [GitHub](https://github.com/evidai/lemon-cake)

---

## 📄 License

MIT © [LemonCake](https://lemoncake.xyz)
