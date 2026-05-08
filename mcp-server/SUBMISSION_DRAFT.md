# Anthropic Connectors Directory — Submission Draft

**Form URL**: https://clau.de/desktop-extention-submission  
**Submission type**: Desktop extension (MCPB) — local stdio MCP server
**Estimated review time**: ~2 weeks

---

## Form fields

### 1. Connector name
```
LemonCake — Give your AI agent a wallet
```

### 2. Short description (1 sentence, ~120 chars)
```
Pay-per-call USDC payments for any HTTP API, with a marketplace of pre-integrated services and Japanese tax compliance baked in.
```

### 3. Long description
```
LemonCake gives any AI agent a wallet. Instead of asking users for 15 different API keys, the agent presents one Pay Token (a JWT with a hard USDC cap, expiry, and service scope) and LemonCake handles per-call billing across the marketplace.

What works out of the box:
• list_services / call_service to a marketplace of 16+ live paid APIs (Serper, Hunter.io, Firecrawl, Jina Reader, IPinfo, OpenExchangeRates, Slack, gBizINFO, 国税庁 invoice check, e-Gov 法令, AbstractAPI VAT, AfterShip, etc.)
• check_balance for USDC remaining on the buyer's account
• check_tax for Japanese qualified-invoice (適格請求書) validation and source-withholding (源泉徴収) determination
• get_service_stats for aggregate marketplace usage
• setup for an interactive on-boarding walkthrough (no auth required)

Demo mode (no signup, no credit card): if neither LEMON_CAKE_PAY_TOKEN nor LEMON_CAKE_BUYER_JWT is set, the server boots in DEMO MODE so reviewers can exercise the entire tool surface — including call_service via demo_search/demo_echo/demo_fx — without registering.

Safety model: the Pay Token JWT has limitUsdc, scope, and expiresAt baked in. The agent physically cannot exceed these even under prompt injection. Token revocation is instant.
```

### 4. Category (pick one)
```
Productivity / Finance / Developer tools
```
**Recommended**: **Finance** (primary), **Developer tools** (secondary)

### 5. Documentation URL (must be public)
```
https://github.com/evidai/lemon-cake/blob/main/mcp-server/CONNECTOR_DIRECTORY.md
```
Backup: https://lemoncake.xyz/docs/quickstart

### 6. Privacy policy URL
```
https://lemoncake.xyz/privacy
```

### 7. Support / Contact
- Issues: https://github.com/evidai/lemon-cake/issues
- Email: contact@aievid.com
- X: @aievid_jp

### 8. Tools list (with annotations)
- `setup` — Setup guide. readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
- `list_services` — List marketplace services. readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
- `call_service` — Call a paid service (charges USDC). readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=true
- `check_balance` — Check USDC balance. readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
- `check_tax` — Japanese tax compliance check. readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
- `get_service_stats` — Marketplace usage stats. readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true

### 9. Prompts list
- `explore-demo` — Try the demo (no signup)
- `discover-marketplace` — Discover marketplace services
- `japan-tax-check` — Validate a Japanese invoice number
- `spend-with-budget` — Spend with a strict budget cap
- `real-vs-demo` — Compare demo vs real upstream
- `japan-finance-bundle` — Japan finance research bundle

### 10. Test credentials for reviewer
```
DEMO MODE is built into the server. If LEMON_CAKE_PAY_TOKEN is empty, all
tools run with mock data — reviewers can exercise the full surface
without any account.

If you'd prefer a live account with $5 USDC pre-loaded, email
contact@aievid.com with subject "Anthropic Directory reviewer" and we'll
provision within 24h.
```

### 11. What to try (5 prompts)
See CONNECTOR_DIRECTORY.md "What to try" section. Top 3:

1. **Cold-start setup**: "Use the LemonCake setup tool. Show me what's configured and what's missing."
2. **Marketplace discovery**: "Use list_services to show me everything LemonCake offers, then pick one service that's good for B2B email lookup and explain why."
3. **Demo call**: "Run demo_search through call_service with the query 'Anthropic MCP server'. Show me the response."

### 12. Branding materials
- Icon: `mcp-server/icon.png` (TODO: add 512x512 lemon icon)
- Screenshots: `mcp-server/screenshots/` (TODO: add 2-3 screenshots)

### 13. Production-ready confirmation ✅
- Live since: 2026-04
- Current version: 0.5.0 (npm: pay-per-call-mcp)
- 16+ services in marketplace, hourly health checks
- Auto-refund on charge failure (BullMQ + 3 retries)
- Real-money flow tested end-to-end (HOT_WALLET on Polygon, Treasury, batch payouts)
- npm downloads / GitHub stars / Glama listing all live

### 14. Compliance checklist
- [x] All tools have title + readOnlyHint/destructiveHint annotations
- [x] Documentation URL public (CONNECTOR_DIRECTORY.md + lemoncake.xyz)
- [x] Privacy policy URL public (https://lemoncake.xyz/privacy)
- [x] HTTPS-only API endpoint (api.lemoncake.xyz)
- [x] Demo mode lets reviewers test without signup
- [x] License: MIT (https://github.com/evidai/lemon-cake/blob/main/LICENSE)
- [x] SECURITY.md present
- [x] CODE_OF_CONDUCT.md present
- [x] Production-ready (not beta)
- [ ] Icon.png 512x512 — TODO before submission
- [ ] Screenshots 2-3 — TODO before submission
- [ ] MCPB pack via `mcpb pack` — TODO before submission
```

---

## Pre-submission TODO (left for user)

| # | Task | Owner | Time |
|---|------|-------|------|
| 1 | Create 512x512 PNG icon (LemonCake lemon emoji style) | User or designer | 30min |
| 2 | Take 2-3 screenshots of LemonCake in Claude Desktop (list_services output, call_service result) | User | 10min |
| 3 | `npm install -g @anthropic-ai/mcpb && cd mcp-server && mcpb pack` to create `lemon-cake.mcpb` | User | 5min |
| 4 | Open https://clau.de/desktop-extention-submission and paste this draft | User | 15min |

---

## After submission

- Review timeline: ~2 weeks
- If rejected, common reasons:
  1. Icon missing or low quality
  2. MCPB bundle fails to load (test with `mcpb validate`)
  3. Tool annotations missing on a tool we forgot

- Once approved:
  1. Announce on X (jp + en) and LinkedIn
  2. Update README to add "Featured in Anthropic Connectors Directory" badge
  3. Add to /about page
  4. Mention in next monthly growth report
