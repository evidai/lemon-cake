# Contributing to LemonCake

Thanks for your interest in LemonCake — the AI agent micropayment marketplace where agents pay per call in USDC for premium APIs without managing API keys.

This monorepo contains:

| Path | What it is |
|------|------------|
| `api/` | Hono + Prisma backend (Railway). Proxy, charge worker, treasury, admin. |
| `dashboard/` | Next.js dashboard (Vercel). Buyer + seller + admin UI at lemoncake.xyz. |
| `mcp-server/` | npm package `lemon-cake-mcp` — MCP server for Claude Desktop / Cursor / Cline. |
| `create-lemon-agent/` | npm package — `npx create-lemon-agent` scaffold. (Separate repo: evidai/create-lemon-agent) |

## Quick start (local dev)

```bash
# clone + install
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake

# API
cd api && npm install && cp .env.example .env  # fill in DATABASE_URL etc.
npx prisma generate && npm run dev

# Dashboard (separate terminal)
cd ../dashboard && npm install && npm run dev

# MCP server
cd ../mcp-server && npm install && npm run dev
```

## Reporting bugs

1. Check existing [issues](https://github.com/evidai/lemon-cake/issues) first
2. Use the bug template (when provided) — include:
   - Component (`api`, `dashboard`, `mcp-server`)
   - Reproduction steps
   - Expected vs actual behavior
   - Environment (OS, Node version, npm package version)

For **security issues**, see [SECURITY.md](./SECURITY.md) — do **not** open public issues.

## Suggesting features

Open a [Discussion](https://github.com/evidai/lemon-cake/discussions) (preferred over issues for proposals). Include:

- The user pain you're solving
- Proposed UX (sketches OK)
- Why this is in-scope for LemonCake (vs adjacent infra)

## Pull requests

We welcome PRs from anyone. To make merge smoother:

1. **Open an issue / discussion first** for large changes — saves you from rewriting
2. **Branch off `main`** with a descriptive name (e.g. `feat/coinbase-commerce-receipt-link`)
3. **Keep diffs focused** — one logical change per PR
4. **Type-check before pushing**: `npx tsc --noEmit` (in each affected package)
5. **Run tests if you touched API or worker logic**: `cd api && npm test` (node:test, no extra deps)
6. **Match commit style** — see git log for examples (`feat(scope): ...`, `fix(scope): ...`, `chore: ...`)

We squash-merge by default.

## Adding a new paid service to the marketplace

The 16 services in production live in `api/prisma/seed.ts` + DB rows. To propose a new service:

1. Open an issue with: API name, vendor docs URL, expected price/call, why agents would want it
2. We discuss feasibility (API stability, terms-of-service, agent-friendliness)
3. If approved, we (or you) add: DB seed entry + endpoint config + auth header + smoke test
4. Service goes through internal smoke test before being marked `verified=true`

## Code style

- TypeScript strict, no `any` unless clearly justified
- Prisma for DB access, no raw SQL except in scripts
- viem for on-chain (Polygon USDC), no ethers.js
- Hono for HTTP, no Express
- Next.js App Router (not Pages), no SWR (use plain fetch)
- Comments only when WHY is non-obvious — well-named identifiers > comments

## Releasing

- `mcp-server` and `create-lemon-agent` are published to npm via `npm publish` from a Granular Access Token (bypass-2FA enabled) — see [`api/scripts/archive/README.md`](api/scripts/archive/README.md) for ops notes.
- API auto-deploys to Railway on `main` push.
- Dashboard auto-deploys to Vercel on `main` push.

## License

By contributing, you agree your contributions are licensed under [MIT](./LICENSE).

## Questions

- Code questions: [GitHub Discussions](https://github.com/evidai/lemon-cake/discussions)
- Quick questions: Discord (link on lemoncake.xyz)
- Commercial / partnership: contact@aievid.com
