# LemonCake for Dify 🍋

![LemonCake demo — issue Pay Token, call upstream, revoke, reconcile](./_assets/demo.svg)

Give your Dify agent a wallet — spend-capped Pay Tokens, a one-click kill switch, automatic freee journal entries, and Japanese qualified-invoice (適格請求書) verification, all callable from inside a Dify workflow.

- **Homepage:** https://lemoncake.xyz
- **Source:** https://github.com/evidai/lemon-cake
- **Contact:** contact@aievid.com
- **Privacy Policy:** see [`PRIVACY.md`](./PRIVACY.md) or https://lemoncake.xyz/legal/dify-plugin

---

## What this plugin does

| Tool | Endpoint | Use for |
|---|---|---|
| `issue_pay_token` | `POST /api/tokens` | Mint a spend-capped, time-boxed JWT that the agent uses as a Bearer token |
| `check_balance` | `GET /api/auth/me` | Read the buyer's current USDC balance + KYA tier limit |
| `revoke_token` | `PATCH /api/tokens/{id}/revoke` | Immediate, atomic kill switch for a running agent |
| `list_charges` | `GET /api/charges` | Retrieve recent charges for reconciliation / summarization |

All calls are proxied through Dify's own request log, giving your IT/security team a full audit trail out of the box.

## 🚀 Get started in 3 minutes

You'll need a LemonCake account with a USDC balance to use this plugin.

1. **[Create a free account](https://lemoncake.xyz/register?utm_source=dify-plugin&utm_medium=marketplace-readme&utm_campaign=onboard)** — email-only signup
2. **[Top up USDC](https://lemoncake.xyz/dashboard/billing?utm_source=dify-plugin&utm_medium=marketplace-readme&utm_campaign=topup)** — minimum $5, JPYC supported
3. **Copy your Buyer JWT** — from [Dashboard → Settings → API](https://lemoncake.xyz/dashboard?utm_source=dify-plugin&utm_medium=marketplace-readme)
4. Install the plugin in Dify and paste the JWT (see below)

> 📚 [Full quickstart docs](https://lemoncake.xyz/docs/quickstart?utm_source=dify-plugin&utm_medium=marketplace-readme)

## Installation

1. Dify → **Plugins** → **Marketplace** → search `LemonCake` → **Install**
2. Open the plugin settings and paste your **Buyer JWT**
   - Get it from [lemoncake.xyz → Dashboard → Settings → API](https://lemoncake.xyz/dashboard?utm_source=dify-plugin&utm_medium=marketplace-readme)
3. Click **Save**. The plugin validates the token against `GET /api/auth/me` before enabling.

## Example workflow

```
User: 「この3記事を要約して」
 └─> LLM plans tasks
      └─> Tool: issue_pay_token(service_id="jina-reader", limit_usdc=2, expires_in_seconds=600)
           └─> Tool: (jina-reader plugin)   ← uses the Pay Token as Bearer
                └─> Tool: list_charges(limit=5)
                     └─> LLM: "3件の記事を読みました。使用料は $0.045 USDC です。"
```

## Security posture

- The Buyer JWT is stored in Dify's encrypted credential store (same as any other tool secret).
- Every request from the plugin carries `Authorization: Bearer <buyer-jwt>`; no data leaves Dify except the fields you see in the tool definitions.
- See [`/docs/dify/audit-kit/`](../../../docs/dify/audit-kit/) in the repo for a full information-security review pack (data-flow diagram, retention policy, incident response).

## Japanese 🇯🇵

日本語の使い方とインストール手順は [`README.ja.md`](./README.ja.md) を参照してください。

## License

MIT — the plugin is free to use, fork, and self-host. The upstream LemonCake managed service has its own usage terms at https://lemoncake.xyz/legal.
