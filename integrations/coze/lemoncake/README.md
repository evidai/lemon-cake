# LemonCake for Coze

![LemonCake demo — issue Pay Token, call upstream, revoke, reconcile](./demo.svg)

M2M payment infrastructure plugin for [Coze](https://www.coze.com) / [扣子](https://www.coze.cn) bots. Give your agent a spend-capped USDC wallet, a one-click kill switch, and automatic accounting sync.

- **Auth:** Buyer JWT (Bearer, HMAC-SHA256 signed)
- **API base:** `https://api.lemoncake.xyz`
- **Tools:** `issue_pay_token`, `check_balance`, `revoke_token`, `list_charges`
- **Source:** https://github.com/evidai/lemon-cake
- **Privacy policy:** https://lemoncake.xyz/legal/dify-plugin

## Files

| file | role |
|---|---|
| `manifest.json` | Coze plugin manifest (wrapper + auth + tool index) |
| `openapi.yaml`  | OpenAPI 3.1 spec of the 4 endpoints |
| `SUBMIT.md`     | Step-by-step submission to the Coze Plugin Store |

## Why different from Dify

Coze plugins are **thin OpenAPI clients** — Coze calls your hosted HTTPS endpoints directly. Unlike Dify, there is no `.difypkg`, no hosted Python runtime, and no GitHub-repo submission path. You create the plugin in the Coze web workspace, paste the OpenAPI spec, test, and publish to the Plugin Store for review.

We keep the manifest + OpenAPI in this directory so that the plugin definition is version-controlled and reproducible across both `coze.com` (global) and `coze.cn` (China).

## Getting started (users)

1. Open the bot editor in Coze → **Plugins** → **Add plugin** → search "LemonCake" (after we publish). Install → paste your Buyer JWT.
2. Or before we publish: **Create plugin** → **Import from OpenAPI** → upload `openapi.yaml` → set auth to Bearer token → paste your Buyer JWT → Test → Add to bot.

See `SUBMIT.md` for the publication workflow.
