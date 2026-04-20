## Summary

Adds **LemonCake** — a payment infrastructure plugin that lets Dify agents pay for upstream APIs with hard spending caps, a one-click kill switch, and (for Japanese users) automatic freee / QuickBooks / Xero journal entries and 適格請求書 / 源泉徴収 handling.

**Author:** evidai / LemonCake (contact@aievid.com)
**Homepage:** https://lemoncake.xyz
**Plugin source:** https://github.com/evidai/lemon-cake/tree/main/integrations/dify/lemoncake
**Privacy policy:** https://lemoncake.xyz/legal/dify-plugin

## Tools included (4)

| tool | endpoint it wraps | purpose |
|---|---|---|
| `issue_pay_token` | `POST /api/tokens` | Mint a spend-capped, time-boxed JWT that the agent uses as a Bearer token for paid APIs |
| `check_balance` | `GET /api/auth/me` | Return current USDC balance and KYA daily limit |
| `revoke_token` | `PATCH /api/tokens/{id}/revoke` | Atomic, race-safe kill switch — rejects subsequent charges with HTTP 422 |
| `list_charges` | `GET /api/charges` | Retrieve recent charges for reconciliation / summarization |

All traffic is proxied through Dify's own request log; no analytics, no third-party trackers.

## Differentiation vs existing payment-adjacent tools

To my knowledge this is the **first agent-payment plugin in the Dify Marketplace**. Unlike Stripe / PayPal tools (designed for a human checkout flow), LemonCake is built around M2M payments: signed JWTs with scoped limits, atomic revoke, idempotency keys, and sandbox mode for safe dry-runs.

For Japanese users specifically, charges auto-sync to freee and get checked against the National Tax Agency qualified-invoice registry (適格請求書) — features that don't exist in any agent-payment product today.

## Credentials

- `api_base_url` (default `https://api.lemoncake.xyz`) — for self-hosted users
- `buyer_jwt` — secret-input, obtained from lemoncake.xyz → Dashboard → Settings → API

Validated at install time via `GET /api/auth/me` before the plugin is enabled.

## Safety & audit

- Source code for the plugin is MIT-licensed and fully public.
- An IT/security audit kit (data-flow diagram, security whitepaper, log retention policy, compliance status, incident response) is shipped alongside the plugin: https://github.com/evidai/lemon-cake/tree/main/docs/dify/audit-kit
- No conversation content, file uploads, or other tool outputs are ever transmitted — only the enumerated parameters per tool.

## Testing performed

- [x] Plugin installs cleanly via Dify CLI in local dev (`dify plugin init` → upload)
- [x] Credential validation rejects an invalid JWT with a clear error message
- [x] Each of the 4 tools returns expected JSON + human-readable messages
- [x] `revoke_token` behavior matches 404 / 409 / 200 paths against live API
- [x] UTF-8 safe (Japanese copy renders correctly in all three manifest languages)

## Happy to iterate on anything

File paths, descriptions, icon, privacy policy copy — please flag anything that doesn't match the Dify Marketplace style and I'll ship a v0.0.2 with the adjustments.

cc @langgenius/dify-plugins-reviewers 🍋
