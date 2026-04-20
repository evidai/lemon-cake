# LemonCake Dify Plugin — Privacy Policy

_Last updated: 2026-04-20_

This policy describes what data the **LemonCake for Dify** plugin transmits, where it is processed, and how long it is retained. The plugin is distributed by **evidai / LemonCake** (contact@aievid.com).

The online version of this document is served at <https://lemoncake.xyz/legal/dify-plugin> and must match the copy shipped in the plugin package.

## 1. What the plugin does

The plugin is a thin HTTP client that calls the LemonCake API (`https://api.lemoncake.xyz` by default) using the Buyer JWT that the plugin user supplies during setup. It exposes four tools: `issue_pay_token`, `check_balance`, `revoke_token`, and `list_charges`.

The plugin itself does not maintain a database, does not write to disk, and does not call any third-party service other than the LemonCake API endpoint configured in its credentials.

## 2. Data the plugin sends to LemonCake

| Context | Data transmitted | Direction |
|---|---|---|
| `_validate_credentials` (install) | `Authorization: Bearer <buyer-jwt>` header | Dify → `api.lemoncake.xyz` |
| `issue_pay_token` | `serviceId`, `limitUsdc`, `expiresInSeconds`, `sandbox` | Dify → `api.lemoncake.xyz` |
| `check_balance` | None (JWT only) | Dify → `api.lemoncake.xyz` |
| `revoke_token` | `tokenId` | Dify → `api.lemoncake.xyz` |
| `list_charges` | `limit` | Dify → `api.lemoncake.xyz` |

The plugin does **not** read Dify conversation content, user messages, file uploads, or any other tool outputs. It only sends the exact parameters enumerated above.

## 3. Data LemonCake returns

- Pay Token metadata (id, expiry, limit, status)
- Buyer profile summary (id, balance, KYA tier, daily limit)
- Charge records (serviceId, amountUsdc, timestamp, sandbox flag)

Values returned to Dify are surfaced to the LLM and to the user; they are not cached by the plugin itself.

## 4. Where data is stored

- **Buyer JWT** — stored in Dify's encrypted credential store (owned by the Dify instance operator). The plugin never writes it anywhere else.
- **Charges, tokens, audit logs** — stored by LemonCake in a managed Postgres database hosted on Railway (ap-northeast-1 region by default). Retention: 2 years, or until the buyer account is closed.
- **Request logs at api.lemoncake.xyz** — 30-day rolling retention. Includes request path, status code, buyer id. Does **not** include Pay Token secret material or Dify conversation content.

## 5. Third parties

- **Railway** — infrastructure host for the LemonCake API (US-region fallback if JP is unavailable).
- **Polygon network** — settlement layer for USDC/JPYC transfers. On-chain data (wallet address, amount) is public by design.
- **freee / QuickBooks / Xero / Zoho / Sage / NetSuite** — only called if the buyer has explicitly connected their own accounting account via LemonCake's OAuth flow. Never called from this plugin directly.

The plugin does **not** send data to any analytics, advertising, or tracking third party.

## 6. User rights

Users whose activity is recorded may:

- Request a copy of all tokens and charges tied to their Buyer ID.
- Revoke any or all Pay Tokens immediately (via the `revoke_token` tool or the LemonCake dashboard).
- Delete their Buyer account, which permanently removes tokens, charges, and audit logs after a 30-day grace window.

All requests: contact@aievid.com.

## 7. Security

- The plugin uses TLS 1.2+ for every request.
- Buyer JWTs are signed with Ed25519 on LemonCake's side; the plugin never inspects their contents.
- The upstream LemonCake API enforces rate limits, idempotency keys, and atomic revoke for race-safe kill-switch operation.
- Source code of the plugin is public at <https://github.com/evidai/lemon-cake> under `/integrations/dify/lemoncake/` for independent review.

## 8. Changes to this policy

Material changes are published at <https://lemoncake.xyz/legal/dify-plugin> and surfaced in the plugin's README. The `Last updated` timestamp above is the authoritative date.

## 9. Contact

- Email: contact@aievid.com
- Issues: <https://github.com/evidai/lemon-cake/issues>
