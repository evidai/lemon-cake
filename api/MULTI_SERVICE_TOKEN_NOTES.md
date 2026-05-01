# Multi-service Pay Token — Handoff Notes

> **Branch:** `feat/multi-service-pay-token`
> **Status:** Code complete, **NOT yet merged / deployed**
> **Created:** 2026-05-01
> **Goal:** Let `create-lemon-agent` (and any agent doing dynamic service discovery) work end-to-end with USDC charging.

---

## Why this exists

`create-lemon-agent` ships an agent that calls `mcp__lemon-cake__list_services`,
picks a service, then calls `mcp__lemon-cake__call_service`. With the original
Pay Token model — one token = one `serviceId` — the agent can only ever call
the single service it was issued for, and gets a 403 from `/api/proxy/:serviceId`
on anything else (`このトークンはサービス X 用です。Y へのアクセスは許可されていません。`).

This branch adds an **ALL** token scope so a single Pay Token can call any
APPROVED service, with `limitUsdc` acting as the overall budget cap.

## What changed

| File | Change |
|---|---|
| `api/prisma/schema.prisma` | Added `TokenScope { SINGLE \| ALL }` enum. `Token.serviceId` made nullable. `Token.scope` added with default `SINGLE`. |
| `api/src/lib/jwt.ts` | `PayTokenPayload.scope` added (`"SINGLE" \| "ALL"`, optional in JWT for back-compat). `signPayToken` accepts `scope`; encodes `scope` claim and omits `serviceId` for ALL. `verifyPayToken` defaults missing `scope` to `SINGLE`. |
| `api/src/routes/tokens.ts` | `POST /api/tokens` body accepts optional `scope: "SINGLE" \| "ALL"` (default `SINGLE`). `serviceId` required only for SINGLE (validated via `.refine()`). Token row stores `scope`; `serviceId` is null for ALL. Response and list include `scope`. |
| `api/src/routes/proxy.ts` | `ANY /api/proxy/:serviceId/*` skips the `tokenServiceId === serviceId` check when `scope === "ALL"`. All other validation (token revoked, expired, limit, balance, service approved) is unchanged and still runs. |
| `api/src/routes/charge.ts` | `POST /api/charge` rejects ALL-scope tokens with 400 ("use /api/proxy"). The direct charge API has no service in its body, and ALL tokens have no service in their JWT, so it can't determine what to charge. |
| `api/prisma/migrations/20260501000000_token_scope_multi_service/migration.sql` | Descriptive SQL migration for audit trail. Not auto-applied — see "Deployment" below. |

## What is NOT changed

- **Existing tokens** keep working without modification. They have no `scope`
  claim in their JWT, which `verifyPayToken` treats as `SINGLE`, and they
  continue to be checked against their bound `serviceId` as before.
- **`/api/quote`** unchanged — only reads token-level constraints (limit,
  balance, expiry), which apply to both scopes.
- **MCP server (`lemon-cake-mcp`)** unchanged. It just forwards the Pay
  Token in the Authorization header; the proxy handles scope validation.
- **`create-lemon-agent` template** unchanged. End users still set
  `LEMON_CAKE_PAY_TOKEN` to whatever they got from the dashboard.

## Deployment

This API repo deploys via Railway, which runs the Dockerfile's
`CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]`.

That means **`db push` is what actually mutates the production schema**, not
`prisma migrate deploy`. The migration file in this PR is documentation; it
won't be executed by Railway. The schema delta is applied directly from
`schema.prisma` on container start.

The schema changes are non-destructive:

- `ADD COLUMN scope ... DEFAULT 'SINGLE'` — safe, all existing rows get `SINGLE`.
- `ALTER COLUMN serviceId DROP NOT NULL` — relaxes a constraint, no data loss.

So the rollout sequence is:

1. Review and merge this PR.
2. Railway auto-deploys. `db push` applies the schema delta (~1s, no
   downtime expected for these specific changes).
3. New code starts up. Existing tokens continue to work (treated as SINGLE).
4. New ALL-scope tokens can now be issued via `POST /api/tokens` with
   `{ "scope": "ALL", "limitUsdc": "5" }`.

If `db push` rejects the changes for any reason (e.g. drift detected), the
deploy will crash-loop. Roll back by reverting the merge — the dropped NOT NULL
and the `scope` column would need a manual SQL `ALTER` to restore, but rollback
is rare for schema-additive changes like this.

## Issuing an ALL-scope token (after deploy)

```bash
curl -X POST https://api.lemoncake.xyz/api/tokens \
  -H "Authorization: Bearer <buyer JWT>" \
  -H "Content-Type: application/json" \
  -d '{"scope":"ALL","limitUsdc":"5"}'
```

Response includes `scope: "ALL"`, `serviceId: null`, and a JWT with the new
`scope` claim. Stick that JWT in `LEMON_CAKE_PAY_TOKEN`, and the agent can
call any APPROVED service up to 5 USDC total.

## Security trade-off

ALL-scope tokens widen the blast radius if a token leaks. Mitigations:

- `limitUsdc` is the hard cap; set it small (e.g. $1–$5) for most use cases.
- Tokens are still revocable (`PATCH /api/tokens/:id/revoke`) and bulk-revocable
  (`POST /api/tokens/revoke-bulk`).
- Approved-only: the proxy still rejects services with `verified=false` or
  unset endpoints.
- Sandbox option still works — issue an ALL+sandbox token to demo without
  spending real USDC.

## Not done in this PR

- **Dashboard UI** (`dashboard/`) does not yet expose a way to issue
  ALL-scope tokens. Users would have to call the API directly. A small UI
  change — adding a scope selector to the token-creation form — is the
  natural follow-up.
- **OpenAPI doc strings** in `tokens.ts` could be expanded to describe the
  scope behavior more thoroughly. Current code is self-documenting enough
  for SDK generation.
- **Tests.** `api/` has zero tests. This PR doesn't add any. Manual smoke
  testing required after deploy.

## Quick smoke test after deploy

```bash
# 1. Issue an ALL+sandbox token (no real money)
TOKEN=$(curl -s -X POST https://api.lemoncake.xyz/api/tokens \
  -H "Authorization: Bearer $BUYER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"scope":"ALL","limitUsdc":"1","sandbox":true}' | jq -r .jwt)

# 2. Call any APPROVED service via /api/proxy
curl -X POST https://api.lemoncake.xyz/api/proxy/<any-approved-serviceId>/<path> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: 200 from upstream + X-Charge-Id header.
# If still 403 with "このトークンはサービス … 用です": deploy didn't pick up the new code.
```
