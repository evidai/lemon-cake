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
- An IT/security audit kit (data-flow diagram, security whitepaper, log retention policy, compliance status, incident response, 60-item self-assessment checklist, DPA template, security-questionnaire answers) is shipped alongside the plugin: https://github.com/evidai/lemon-cake/tree/main/docs/dify/audit-kit
- No conversation content, file uploads, or other tool outputs are ever transmitted — only the enumerated parameters per tool.
- Hardened HTTP client (`tools/http_client.py`): HTTPS-only enforcement for `api_base_url`, retries with exponential backoff on 429/5xx, `Idempotency-Key` header on every POST/PATCH, structured error parser that never leaks raw upstream response bodies, 1 MiB response-size cap.

## Changelog

### 0.0.2 (current)
- **Bug fix:** `check_balance` now hits `GET /api/auth/me` (buyer-scoped) instead of `GET /api/buyers` (admin-only list) — the previous path returned 401 for end users.
- **Security:** plaintext `api_base_url` is refused before the Buyer JWT is transmitted; response bodies capped at 1 MiB; raw upstream error bodies replaced with a structured parser.
- **Resilience:** exponential-backoff retries on 429 / 502 / 503 / 504 with `Retry-After` honored; single 20 s default timeout budget across all tools.
- **Idempotency:** `issue_pay_token` and `revoke_token` now send a fresh `Idempotency-Key` on every call, so a network retry never double-mints or double-revokes.
- **Input validation:** `token_id` must match `^[A-Za-z0-9_-]{8,64}$` (blocks path traversal); `expires_in_seconds` clamped to [60, 2 592 000]; `limit` clamped to [1, 100].
- **Metadata:** plugin `author` corrected to `evidai`; `User-Agent: lemoncake-dify/0.0.2 (+https://lemoncake.xyz)` sent on every request.

### 0.0.1
- Initial submission.

## Testing performed

- [x] Plugin installs cleanly via Dify CLI in local dev (`dify plugin init` → upload)
- [x] Credential validation rejects an invalid JWT with a clear error message
- [x] Credential validation rejects a non-HTTPS `api_base_url`
- [x] Each of the 4 tools returns expected JSON + human-readable messages
- [x] `revoke_token` behavior matches 404 / 409 / 200 paths against live API
- [x] UTF-8 safe (Japanese copy renders correctly in all three manifest languages)
- [x] Python files `py_compile` cleanly; no relative imports (`from tools.http_client import ...`)

## Happy to iterate on anything

File paths, descriptions, icon, privacy policy copy — please flag anything that doesn't match the Dify Marketplace style and I'll ship a v0.0.3 with the adjustments.

cc @langgenius/dify-plugins-reviewers 🍋
