# 🍋 eliza-plugin-lemoncake

**Eliza エージェントに、3分で自律決済（JPYC/USDC）機能を追加しましょう。**

[LEMONCake](https://lemoncake.xyz) の JWT Pay Token を使い、AI エージェントが人間の介在なしに M2M（マシン間）API 課金を実行できるようになります。

---

## ✨ 特徴

- **ゼロ摩擦の導入** — npm install して character.plugins に追加するだけ
- **2つの認証モード** — クイックスタート（PAY_TOKEN）/ 本番運用（BUYER_JWT）
- **予算上限付きアクセス** — Pay Token は上限 USDC を超えると自動停止
- **Eliza v2 完全対応** — `@elizaos/core` v2.0.0-alpha.1 以上
- **TypeScript 製** — 型定義同梱

---

## 📦 インストール

```bash
npm install eliza-plugin-lemoncake
# または
pnpm add eliza-plugin-lemoncake
```

---

## 🚀 セットアップ

### Step 1: プラグインを character に追加

```typescript
import { lemoncakePlugin } from "eliza-plugin-lemoncake";

const character = {
  name: "MyAgent",
  plugins: [lemoncakePlugin],
  // ...
};
```

### Step 2: APIキーの設定（用途に合わせて選べます）

#### A. クイックスタートモード（おすすめ：最速で試したい方）

[LEMONCake ダッシュボード](https://lemoncake.xyz/dashboard) で Pay Token を発行し、`.env` に設定します。

```env
LEMONCAKE_PAY_TOKEN=eyJhbGci...  # ダッシュボードで発行した Pay Token
```

> **Pay Token とは？**
> 特定のサービスに対して上限 USDC 付きで発行するアクセストークンです。
> 上限を超えると自動で決済が止まるので、エージェントへの権限委譲に最適です。

#### B. 本番運用モード（動的な都度発行を使いたい方）

エージェントが呼び出しのたびに自動で Pay Token を発行します。

```env
LEMONCAKE_BUYER_JWT=eyJhbGci...  # ダッシュボードの Settings からコピー
```

> A と B を両方設定した場合、**A（PAY_TOKEN）が優先**されます。

---

## 💡 使い方

設定完了後、エージェントに話しかけるだけで自動的に実行されます：

```
LEMONCake の demo_agent_search_api を 0.50 USDC で呼び出して
```

```
serviceId: svc_invoice_check に 0.10 USDC 支払いを実行して
```

### アクションから直接呼び出す

```typescript
await runtime.processActions(
  message,
  [{
    name: "EXECUTE_LEMONCAKE_PAYMENT",
    parameters: {
      serviceId:  "demo_agent_search_api",
      limitUsdc:  "0.50",
      path:       "/search",
      method:     "POST",
      body:       JSON.stringify({ query: "AI agent payments" }),
      buyerTag:   "my-agent-session-001",
    },
  }],
);
```

---

## ⚙️ アクション仕様

**アクション名**: `EXECUTE_LEMONCAKE_PAYMENT`

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| `serviceId` | string | ✅ | LEMONCake マーケットプレイスのサービス ID |
| `limitUsdc` | string | — | 上限額（USDC）例: `"0.50"` |
| `path` | string | — | サービス内のサブパス 例: `"/search"` |
| `method` | string | — | HTTP メソッド（GET/POST/PUT/PATCH/DELETE） |
| `body` | string | — | リクエストボディ（JSON 文字列） |
| `buyerTag` | string | — | 監査ログ用タグ |

---

## 🔐 環境変数一覧

| 変数名 | 必須 | 説明 |
|---|---|---|
| `LEMONCAKE_PAY_TOKEN` | △ | 事前発行済み Pay Token（クイックスタート） |
| `LEMONCAKE_BUYER_JWT` | △ | Buyer JWT（本番運用・都度発行） |
| `LEMONCAKE_API_URL` | — | API エンドポイント（デフォルト: `https://api.lemoncake.xyz`） |

> `LEMONCAKE_PAY_TOKEN` または `LEMONCAKE_BUYER_JWT` のどちらか一方が必須です。

---

## 🏃 ローカル開発

```bash
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake/eliza-plugin-lemoncake

pnpm install
pnpm build      # TypeScript → dist/
```

---

## 📐 アーキテクチャ

```
eliza-plugin-lemoncake/
├── src/
│   ├── index.ts               # Plugin エクスポート
│   ├── types.ts               # 型定義・LemoncakeError
│   ├── actions/
│   │   └── payAction.ts       # EXECUTE_LEMONCAKE_PAYMENT アクション
│   └── lib/
│       └── lemoncakeClient.ts # HTTP クライアント（token発行 + proxy呼び出し）
└── dist/                      # ビルド成果物
```

### 決済フロー

```
Agent → payAction.handler()
           │
           ├─ PAY_TOKEN あり → そのまま使用
           │
           └─ BUYER_JWT のみ → POST /api/tokens → Pay Token 発行
                                      │
                                      └─ POST /api/proxy/:serviceId/:path
                                                 │
                                                 └─ X-Charge-Id, X-Amount-Usdc ヘッダーで課金確認
```

---

## 🔗 関連リンク

- [LEMONCake ダッシュボード](https://lemoncake.xyz/dashboard)
- [LEMONCake API ドキュメント](https://lemoncake.xyz/docs)
- [ElizaOS](https://elizaos.ai)
- [GitHub](https://github.com/evidai/lemon-cake)

---

## 📄 ライセンス

MIT © [LEMONCake](https://lemoncake.xyz)
