# LemonCake Connector — Reviewer Guide

> Submission docs for the Anthropic Connectors Directory. This file is what reviewers should open after `npx -y pay-per-call-mcp` (npm) or after loading `lemon-cake.mcpb` (Claude Desktop).

## What this connector does (1 sentence)

LemonCake gives any AI agent a wallet — agents call paid HTTP APIs (Serper, Hunter.io, Firecrawl, gBizINFO, 国税庁 invoice check, etc.) through a single Pay Token JWT with a hard USDC spending cap, expiry, and scope baked in.

## Why it's useful in Claude

Three concrete user pains it solves:

1. **API key juggling** — instead of pasting 15 vendor keys into Claude config, the user sets one Pay Token and the agent can talk to any marketplace service.
2. **Hard spending cap that the agent physically cannot exceed** — Pay Token has `limitUsdc` baked into the JWT. Even with prompt injection or runaway loops, spend is bounded.
3. **Japanese tax compliance** — `check_tax` validates qualified-invoice (適格請求書) numbers against 国税庁 and determines source-withholding (源泉徴収) — a non-trivial requirement for agents operating in Japanese B2B contexts.

## Demo mode (no signup, no credit card)

If the user has not set `LEMON_CAKE_PAY_TOKEN` or `LEMON_CAKE_BUYER_JWT`, the server boots in **DEMO MODE**. This is intended for reviewers and curious users who want to exercise the full tool surface without registering.

In demo mode:

- `list_services` returns the real marketplace (16+ services) **plus** 3 demo services (`demo_search`, `demo_echo`, `demo_fx`).
- `call_service` to demo IDs returns canned responses; to real IDs returns a friendly "demo mode — please add a Pay Token" hint.
- `check_balance` returns a mock $1.00 balance.
- `check_tax` and `get_service_stats` are real (no auth needed).

This means a reviewer can verify the entire connector works end-to-end without our team handing over test credentials.

## What to try (concrete prompts)

These are the prompts to use in the reviewer's Claude session:

### 1. Cold-start setup (no auth)

```
Use the LemonCake setup tool. Show me what's configured and what's missing.
```

→ Demonstrates auth-aware on-boarding without spending anything.

### 2. Marketplace discovery

```
Use list_services to show me everything LemonCake offers, then pick one
service that's good for B2B email lookup and explain why.
```

→ Should pick Hunter.io and reference its `usage` hint.

### 3. Demo call (no real money)

```
Run demo_search through call_service with the query "Anthropic MCP server".
Show me the response.
```

→ Returns 3 canned results immediately. Verifies call_service plumbing.

### 4. Japanese invoice validation

```
Use check_tax to verify if T1234567890123 is a valid Japanese qualified-invoice
registration, and tell me whether source-withholding applies on a 110,000 JPY
service fee.
```

→ Hits the 国税庁 API (real, no auth required from us).

### 5. (Authenticated, only with Pay Token set) Real call

```
Use call_service to look up the email contacts for anthropic.com via Hunter.io.
Use serviceId from list_services.
```

→ Charges $0.005 USDC, returns 5 real contacts with role + verification.

## Auth flows

This connector supports three modes:

| Mode | Required env | What works |
|------|------------|-----------|
| Demo | nothing | list_services, demo call_service, mock check_balance, real check_tax / get_service_stats / setup |
| Buyer | `LEMON_CAKE_BUYER_JWT` | + real check_balance |
| Live | `LEMON_CAKE_PAY_TOKEN` | + real call_service (charges USDC against the token's cap) |

`LEMON_CAKE_PAY_TOKEN` is a JWT (HS256) issued from the LemonCake dashboard. The user pastes it into Claude Desktop's config (or our MCPB user_config) — there is no OAuth flow today. The Pay Token has `limitUsdc`, `scope`, and `expiresAt` claims baked in, so leaking the token bounds the worst-case loss.

## Data flow & what is sent where

When a user invokes `call_service` for, say, Hunter.io:

1. Claude Desktop sends a tools/call to the MCP server (locally) with the args.
2. The MCP server POSTs to `https://api.lemoncake.xyz/api/proxy/<serviceId>/<path>` with the Pay Token in the Authorization header.
3. Our proxy validates the token, debits the buyer's USDC balance, then forwards the request to Hunter.io with our managed API key.
4. Hunter.io's response is returned verbatim back through the proxy → MCP server → Claude.

What we log:
- The charge record (timestamp, amount, service ID, token ID, idempotency key).
- SHA-256 hashes of the request body and response body (for audit, but not the plaintext).
- We do NOT log the LLM's prompts, reasoning, or tool decisions.

What Provider sites (Hunter.io, Serper, etc.) log: standard HTTP request logs. They see our managed API key and the request body the agent sent. The privacy policy at https://lemoncake.xyz/privacy spells this out.

## Production-readiness signals

- Live since: 2026-04 (v0.3.x); current stable: 0.5.0 (post-rename to `pay-per-call-mcp` on npm; brand and Server() name remain `lemon-cake`)
- 16+ live services in the marketplace, all health-checked hourly via cron
- Charge worker uses BullMQ + 3-attempt exponential backoff with auto-refund on permanent failure
- Bilingual UX (Japanese + English) — README, dashboard, MCP responses
- Structured 4xx error responses include `hint` fields for agent self-correction (401/402/403/404/422/501/5xx all have actionable guidance)
- Public roadmap & issues at https://github.com/evidai/lemon-cake

## Out-of-scope acknowledgements

- We do **not** custody on-chain assets for buyers; buyer balance is held by us as USDC, but tokenized internally. On-chain settlement happens at provider-payout time (daily batch).
- We do **not** run KYC/AML on the buyer beyond an email-only signup flow today; Pay Tokens have built-in cap so the worst-case is bounded by the token's `limitUsdc`.
- We are based in Japan; for non-JP users, the tax features are no-ops but harmless. The marketplace is global.

## Contact

- Documentation index: https://lemoncake.xyz/docs
- Privacy policy: https://lemoncake.xyz/privacy
- Source: https://github.com/evidai/lemon-cake
- Security: https://github.com/evidai/lemon-cake/blob/main/SECURITY.md
- Email: contact@aievid.com
- Founder: Hiroto / @aievid_jp on X

For directory reviewers: a test account with $5 USDC pre-loaded is available — please email contact@aievid.com with the subject "Anthropic Directory reviewer" and we'll provision within 24h. Or just use demo mode (it's designed for this).
