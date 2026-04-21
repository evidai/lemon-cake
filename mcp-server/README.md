# 🍋 lemon-cake-mcp

[![npm version](https://img.shields.io/npm/v/lemon-cake-mcp)](https://www.npmjs.com/package/lemon-cake-mcp)
[![npm downloads](https://img.shields.io/npm/dm/lemon-cake-mcp)](https://www.npmjs.com/package/lemon-cake-mcp)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

**Give your AI agent a wallet.** LemonCake の MCP サーバーで、Claude Desktop / Cursor / Cline などの MCP 互換クライアントから、人間の介在なしに USDC で有料 API を呼び出せるようになります。

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
        "LEMONCAKE_BUYER_JWT": "eyJhbGci..."
      }
    }
  }
}
```

Claude Desktop を再起動すれば、🔨 ツールアイコンに LemonCake のツールが表示されます。

### Cursor / Cline / その他 MCP クライアント

同様に、サーバー起動コマンドを `npx -y lemon-cake-mcp` / 環境変数に `LEMONCAKE_BUYER_JWT` を設定してください。

**Node.js 要件**: v20 以上

---

## 🛠️ 提供ツール

| ツール名 | 用途 |
|---|---|
| `setup` | 初回セットアップガイド（アカウント作成・チャージ方法を返す） |
| `list_services` | LemonCake マーケットプレイスで利用可能な有料 API 一覧 |
| `call_service` | 指定サービスへ Pay Token 経由で課金付き呼び出し |
| `check_balance` | 現在の USDC 残高と KYA 上限を取得 |
| `check_tax` | 国税庁 API で適格請求書発行事業者番号を検証 |
| `get_service_stats` | サービス別の利用統計・課金履歴集計 |

---

## 💡 使い方の例

Claude Desktop で:

> 「LemonCake で `demo_agent_search_api` を 0.50 USDC で呼び出して、"AI agent payments" を検索して」

Claude は自動で:
1. `setup` でセットアップ状況を確認（初回のみ）
2. `call_service(serviceId="demo_agent_search_api", limitUsdc="0.50", body={query:"AI agent payments"})`
3. 結果を要約して返答

---

## 🔐 環境変数

| 変数名 | 必須 | 説明 |
|---|:---:|---|
| `LEMONCAKE_BUYER_JWT` | ✅ | Buyer JWT（ダッシュボードの Settings → API Keys から取得）|
| `LEMONCAKE_API_URL` | — | API エンドポイント（デフォルト: `https://api.lemoncake.xyz`）|

---

## 🏃 ローカル開発

```bash
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake/mcp-server
npm install
npm run build
npm start
```

---

## 🔗 関連リンク

- [LemonCake ダッシュボード](https://lemoncake.xyz/dashboard?utm_source=mcp-server&utm_medium=npm-readme)
- [API ドキュメント](https://lemoncake.xyz/docs?utm_source=mcp-server&utm_medium=npm-readme)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub](https://github.com/evidai/lemon-cake)

---

## 📄 ライセンス

MIT © [LemonCake](https://lemoncake.xyz)
