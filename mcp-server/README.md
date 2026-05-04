# 🍋 lemon-cake-mcp

[![npm version](https://img.shields.io/npm/v/lemon-cake-mcp)](https://www.npmjs.com/package/lemon-cake-mcp)
[![npm downloads](https://img.shields.io/npm/dm/lemon-cake-mcp)](https://www.npmjs.com/package/lemon-cake-mcp)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Glama MCP](https://img.shields.io/badge/Listed%20on-Glama-7c3aed)](https://glama.ai/mcp/servers/lemon-cake-mcp)
[![Node.js](https://img.shields.io/node/v/lemon-cake-mcp)](https://nodejs.org)

> **Give your AI agent a wallet.** Pay-per-call USDC payments for any HTTP API — straight from Claude Desktop, Cursor, Cline, or any MCP client. No human in the loop, no per-API signups, no API key juggling.

LemonCake の MCP サーバーで、Claude Desktop / Cursor / Cline などの MCP 互換クライアントから、人間の介在なしに USDC で有料 API を呼び出せるようになります。

**English ↓** [Quickstart](#-3分で始める) · [Tools](#%EF%B8%8F-提供ツール) · [Use Cases](#-use-cases) · [Compatibility](#-tested-clients)

---

## 🚀 3分で始める

MCP サーバーの利用には LemonCake アカウントと USDC 残高が必要です。

1. **[無料アカウント作成](https://lemoncake.xyz/register?utm_source=mcp-server&utm_medium=npm-readme&utm_campaign=onboard)** — メール1つで完了
2. **残高チャージ** — 最低 $5 USDC または JPYC（[Billing](https://lemoncake.xyz/dashboard/billing?utm_source=mcp-server&utm_medium=npm-readme&utm_campaign=topup)）
3. **Buyer JWT をコピー** — [Dashboard → API Keys](https://lemoncake.xyz/dashboard?utm_source=mcp-server&utm_medium=npm-readme) から
4. 下記の `claude_desktop_config.json` に設定

> 📚 詳細: [クイックスタート ドキュメント](https://lemoncake.xyz/docs/quickstart?utm_source=mcp-server&utm_medium=npm-readme)

---

## 📦 インストール

### Claude Desktop の場合

`~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）または
`%APPDATA%\Claude\claude_desktop_config.json`（Windows）に追加:

```json
{
  "mcpServers": {
    "lemon-cake": {
      "command": "npx",
      "args": ["-y", "lemon-cake-mcp"],
      "env": {
        "LEMON_CAKE_BUYER_JWT": "eyJhbGci..."
      }
    }
  }
}
```

Claude Desktop を再起動すれば、🔨 ツールアイコンに LemonCake のツールが表示されます。

### Cursor / Cline / その他 MCP クライアント

同様に、サーバー起動コマンドを `npx -y lemon-cake-mcp` / 環境変数に `LEMON_CAKE_BUYER_JWT` を設定してください。

**Node.js 要件**: v20 以上

---

## 🛠️ 提供ツール

| ツール名 | 用途 | 主なパラメータ |
|---|---|---|
| `setup` | 初回セットアップガイド（アカウント作成・チャージ方法を返す） | — |
| `list_services` | LemonCake マーケットプレイスで利用可能な有料 API 一覧 | `limit?` (1–100) |
| `call_service` | 指定サービスへ Pay Token 経由で課金付き呼び出し | `serviceId`, `path?`, `method?`, `body?`, `idempotencyKey?` |
| `check_balance` | 現在の USDC 残高と KYA 上限を取得 | — |
| `check_tax` | 国税庁 API で適格請求書発行事業者番号を検証 | `registrationNumber` (T+13桁), `description?`, `amountJpy?` |
| `get_service_stats` | サービス別の利用統計・課金履歴集計 | — |

すべての引数スキーマは MCP Inspector または `tools/list` で取得可能です。

---

## 🎮 Demo Mode（認証情報なしで試せる）

`LEMON_CAKE_BUYER_JWT` / `LEMON_CAKE_PAY_TOKEN` を**何も設定せずに**起動すると、自動で **DEMO MODE** になります。サインアップなしで以下が動きます：

- `list_services` → 実マーケット + `demo_search` / `demo_echo` / `demo_fx` の 3 デモが先頭に
- `call_service` → `demo_*` サービスは canned レスポンスを返却（課金なし、外部呼び出しなし）
- `check_balance` → `$1.00` のモック残高を返却（`mode: "demo"`）
- `check_tax` / `get_service_stats` → 通常通り（元から認証不要）

→ Glama Inspector や [npm の試用環境](https://www.npmjs.com/package/lemon-cake-mcp) でも、何も設定せず実装挙動を確認できます。本番の有料 API を叩きたくなったら `LEMON_CAKE_PAY_TOKEN` を設定してください。

---

## 💡 使い方の例

Claude Desktop で:

> 「LemonCake で `demo_agent_search_api` を 0.50 USDC で呼び出して、"AI agent payments" を検索して」

Claude は自動で:
1. `setup` でセットアップ状況を確認（初回のみ）
2. `call_service(serviceId="demo_agent_search_api", limitUsdc="0.50", body={query:"AI agent payments"})`
3. 結果を要約して返答

---

## 🎯 Use Cases

- **Autonomous research agents** — Let your agent pay-per-call for premium search, scraping, or data APIs without giving it your credit card.
- **Multi-API workflows** — One JWT, one balance, dozens of upstream APIs. No per-vendor signup or rotating keys.
- **Compliance-aware spending** — KYA (Know-Your-Agent) limits cap how much an agent can spend per session/day.
- **Japanese tax automation** — `check_tax` validates 適格請求書 numbers against 国税庁 API for invoice compliance.
- **Idempotent retries** — `idempotencyKey` makes call_service safe to retry without double-charging.

---

## ✅ Tested Clients

| Client | Status | Notes |
|---|:---:|---|
| Claude Desktop (macOS / Windows) | ✅ | Primary target |
| Cursor | ✅ | stdio transport |
| Cline (VS Code) | ✅ | stdio transport |
| Claude Code CLI | ✅ | stdio transport |
| Continue.dev | ✅ | MCP support since v0.9 |
| Custom MCP clients | ✅ | Any client speaking MCP 1.10+ over stdio |

---

## 🔐 環境変数

| 変数名 | 必須 | 説明 |
|---|:---:|---|
| `LEMON_CAKE_BUYER_JWT` | ✅ | Buyer JWT（ダッシュボードの Settings → API Keys から取得）|
| `LEMON_CAKE_PAY_TOKEN` | — | Pay Token JWT（`call_service` で必要、未設定なら demo_* サービスのみ呼べる）|
| `LEMON_CAKE_API_URL` | — | API エンドポイント（デフォルト: `https://api.lemoncake.xyz`）|

---

## 🏃 ローカル開発

```bash
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake/mcp-server
npm install
npm run build
npm start
```

### Docker

```bash
docker build -t lemon-cake-mcp .
docker run --rm -i -e LEMON_CAKE_BUYER_JWT=eyJhbGci... lemon-cake-mcp
```

イメージは Glama Inspector のブラウザ内プレビューにも利用されます。

---

## 🔗 関連リンク

- [LemonCake ダッシュボード](https://lemoncake.xyz/dashboard?utm_source=mcp-server&utm_medium=npm-readme)
- [API ドキュメント](https://lemoncake.xyz/docs?utm_source=mcp-server&utm_medium=npm-readme)
- [Glama MCP listing](https://glama.ai/mcp/servers/lemon-cake-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub](https://github.com/evidai/lemon-cake)
- [Security Policy](https://github.com/evidai/lemon-cake/blob/main/SECURITY.md) · [Contributing](https://github.com/evidai/lemon-cake/blob/main/CONTRIBUTING.md) · [Code of Conduct](https://github.com/evidai/lemon-cake/blob/main/CODE_OF_CONDUCT.md)

---

## 📄 ライセンス

MIT © [LemonCake](https://lemoncake.xyz)
