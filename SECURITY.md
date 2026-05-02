# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in LemonCake, please report it privately so we can address it before public disclosure.

**Preferred channels:**

- 📧 Email: **security@lemoncake.xyz** (primary)
- 🔒 GitHub Security Advisory: [Report a vulnerability](https://github.com/evidai/lemon-cake/security/advisories/new)

**Please include:**

1. A clear description of the vulnerability and impact
2. Steps to reproduce (PoC code, request samples, etc.)
3. Affected component (`api/`, `mcp-server/`, `dashboard/`, `create-lemon-agent/`)
4. Affected version (npm package version, commit SHA, or "live production")
5. Your suggested fix or mitigation, if any

## Response SLA

| Severity | First response | Patch target |
|----------|----------------|--------------|
| Critical (RCE / fund loss / auth bypass) | < 24h | < 72h |
| High (data leak / token forgery / XSS in admin) | < 48h | < 7d |
| Medium (CSRF / minor info disclosure) | < 7d | next release |
| Low (cosmetic / hardening) | < 14d | best-effort |

## Scope

The following are **in scope**:

- `api.lemoncake.xyz` API endpoints
- `lemoncake.xyz` (dashboard / public site)
- `lemon-cake-mcp` (npm package, MCP server)
- `create-lemon-agent` (npm package, scaffold CLI)
- Polygon USDC payment flows (HOT_WALLET handling, charge proxy)
- Pay Token JWT signing / scoping
- Webhook signature validation (Stripe, Coinbase Commerce)

**Out of scope** (will be closed without bounty):

- Vulnerabilities that require physical access to a buyer's machine
- Self-XSS without realistic delivery vector
- Best-practice issues (missing CSP headers, etc.) without proven exploitability
- Issues in third-party services we proxy (Hunter.io, Serper, etc.)
- Social engineering attacks against LemonCake operators

## Disclosure Policy

We follow **coordinated disclosure**:

1. Reporter sends private report
2. We acknowledge within 24h (critical) / 7d (low)
3. We patch and deploy
4. Reporter is credited (if they wish) in the release notes
5. We publish a CVE / advisory **after** the fix has been live for ≥ 7 days

## Bounty

LemonCake is in early commercial stage; we do not currently run a paid bounty program, but we are committed to:

- Public acknowledgement (GitHub advisory + release notes + social media if you consent)
- Free LemonCake credits ($50–$500 depending on severity) for confirmed issues
- Reference / introduction to security teams in our network

We expect to formalize a paid bounty program once monthly revenue justifies it.

## Out-of-Band Channels

For time-critical issues affecting live USDC funds in motion (provider payouts, buyer balances), reach the maintainer directly on:

- LemonCake Discord (DM): see https://lemoncake.xyz for invite link
- Founder X DM: [@aievid_jp](https://x.com/aievid_jp)

Please do **not** post live exploit details in public Discord channels or GitHub issues.
