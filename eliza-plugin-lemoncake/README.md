# 🍋 eliza-plugin-lemoncake

[![npm version](https://img.shields.io/npm/v/eliza-plugin-lemoncake)](https://www.npmjs.com/package/eliza-plugin-lemoncake)
[![npm downloads](https://img.shields.io/npm/dm/eliza-plugin-lemoncake)](https://www.npmjs.com/package/eliza-plugin-lemoncake)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![ElizaOS v2](https://img.shields.io/badge/%40elizaos%2Fcore-%3E%3D2.0.0--alpha.1-blue)](https://elizaos.ai)

**Eliza エージェントに、3分で自律決済（JPYC/USDC）機能を追加しましょう。**

[LemonCake](https://lemoncake.xyz?utm_source=eliza-plugin&utm_medium=npm-readme) の JWT Pay Token を使い、AI エージェントが人間の介在なしに M2M（マシン間）API 課金を実行できるようになります。

---

## 🚀 3分で始める

プラグインの利用には LemonCake アカウントと USDC 残高が必要です。

1. **[無料アカウント作成](https://lemoncake.xyz/register?utm_source=eliza-plugin&utm_medium=npm-readme&utm_campaign=onboard)** — メール1つで完了
2. **残高チャージ** — 最低 $5 USDC または JPYC（日本円ステーブルコイン）
3. **Buyer JWT をコピー** — [Dashboard → API Keys](https://lemoncake.xyz/dashboard?utm_source=eliza-plugin&utm_medium=npm-readme) から
4. `npm install eliza-plugin-lemoncake` してプラグインに設定（下記）

> 📚 詳細は [クイックスタート ドキュメント](https://lemoncake.xyz/docs/quickstart?utm_source=eliza-plugin&utm_medium=npm-readme) を参照。

---

## ✨ 特徴

- **ゼロ摩擦の導入** — npm install して `character.plugins` に追加するだけ
- **2つの認証モード** — クイックスタート（PAY_TOKEN 固定）/ 本番運用（BUYER_JWT で都度発行）
- **予算上限付きアクセス** — Pay Token は上限 USDC を超えると自動停止
- **自然言語トリガー** — 日本語・英語のメッセージから serviceId/limitUsdc を自動抽出
- **冪等性保証** — 呼び出しごとに UUID の `Idempotency-Key` を自動付与
- **Eliza v2 完全対応** — `@elizaos/core` v2.0.0-alpha.1 以上
- **TypeScript 製** — 型定義・宣言ファイル同梱

---

## 📦 インストール

```bash
npm install eliza-plugin-lemoncake
# または
pnpm add eliza-plugin-lemoncake
```

**Node.js 要件**: v23 以上

---

## 🚀 セットアップ

### Step 1: character にプラグインを追加

**TypeScript の場合**

```typescript
import { lemoncakePlugin } from "eliza-plugin-lemoncake";

const character = {
  name: "MyAgent",
  plugins: [lemoncakePlugin],
  // ...
};
```

**character.json の場合**

```json
{
  "name": "MyAgent",
  "plugins": ["eliza-plugin-lemoncake"]
}
```

---

### Step 2: 認証キーの設定（2つのモードから選択）

#### A. クイックスタートモード（おすすめ）

[LemonCake ダッシュボード](https://lemoncake.xyz/dashboard) で事前に Pay Token を発行し、`.env` に設定します。

```env
LEMONCAKE_PAY_TOKEN=eyJhbGci...   # ダッシュボードで発行した Pay Token JWT
```

> **Pay Token とは？**
> 特定のサービスに対して、上限 USDC・有効期限付きで発行するアクセストークンです。
> 上限を超えると自動で決済が止まるので、エージェントへの権限委譲に最適です。

#### B. 本番運用モード（動的都度発行）

エージェントが呼び出しのたびに自動で Pay Token を発行します。
`limitUsdc` で呼び出し単位の上限を制御できます。

```env
LEMONCAKE_BUYER_JWT=eyJhbGci...   # ダッシュボードの Settings からコピー
```

> A と B を両方設定した場合、**A（LEMONCAKE_PAY_TOKEN）が優先**されます。

---

## 💡 使い方

### 自然言語で呼び出す

設定完了後、エージェントに話しかけるだけで `EXECUTE_LEMONCAKE_PAYMENT` が自動実行されます。

```
LemonCake の demo_agent_search_api を 0.50 USDC で呼び出して
```

```
serviceId: svc_invoice_check に 0.10 USDC 支払いを実行して
```

```
USDC で API 料金を払って検索を実行して
```

> **パラメータ抽出の仕組み**
> Eliza の LLM が `serviceId` / `limitUsdc` / `path` / `method` / `body` / `buyerTag` を
> メッセージから自動抽出します（`action.parameters` 定義に基づく）。
> LLM が抽出できない場合は、メッセージテキストの正規表現フォールバックが動作します。
> 例: `serviceId: xxx` の形式、`0.50 USDC` の形式から直接パース。

### アクションをコードから直接呼び出す

```typescript
import { payAction } from "eliza-plugin-lemoncake";

// action.handler を直接実行
await payAction.handler(
  runtime,
  message,
  state,
  {
    parameters: {
      serviceId: "demo_agent_search_api",
      limitUsdc: "0.50",
      path:      "/search",
      method:    "POST",
      body:      JSON.stringify({ query: "AI agent payments" }),
      buyerTag:  "my-session-001",
    },
  },
  async (response) => {
    console.log(response.text);
  },
);
```

### LemoncakeClient を直接利用する

```typescript
import { LemoncakeClient, LemoncakeError } from "eliza-plugin-lemoncake";

const client = new LemoncakeClient({
  apiUrl:   "https://api.lemoncake.xyz",
  payToken: null,
  buyerJwt: process.env.LEMONCAKE_BUYER_JWT ?? null,
});

try {
  // 1. Pay Token を発行（PAY_TOKEN があればスキップ）
  const jwt = await client.resolvePayToken({
    serviceId: "svc_invoice_check",
    limitUsdc: "0.10",
    buyerTag:  "my-agent",
  });

  // 2. サービスを呼び出し
  const result = await client.callService(jwt, {
    serviceId: "svc_invoice_check",
    path:      "/check",
    method:    "POST",
    body:      { invoiceId: "INV-001" },
  });

  console.log("chargeId:", result.chargeId);
  console.log("amount:",   result.amountUsdc, "USDC");
  console.log("response:", result.response);

  // 3. 残高確認
  const me = await client.getBalance();
  console.log("残高:", me.balanceUsdc, "USDC");

} catch (err) {
  if (err instanceof LemoncakeError) {
    console.error(err.code, err.message);
    if (err.retryable) console.log(`${err.retryAfterSec ?? 60}秒後にリトライ`);
  }
}
```

---

## ⚙️ アクション仕様

**アクション名**: `EXECUTE_LEMONCAKE_PAYMENT`

**エイリアス（similes）**: `PAY_WITH_LEMONCAKE` / `CALL_PAID_API` / `EXECUTE_PAYMENT` /
`ISSUE_PAY_TOKEN` / `M2M_PAYMENT` / `AUTONOMOUS_PAYMENT` / `USDC_PAYMENT`

### パラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|---|---|:---:|---|---|
| `serviceId` | string | ✅ | — | LemonCake マーケットプレイスのサービス ID |
| `limitUsdc` | string | — | `"0.10"` | 上限額（USDC）例: `"0.50"` |
| `path` | string | — | `"/"` | サービス内のサブパス 例: `"/search"` |
| `method` | string | — | `"POST"` | HTTP メソッド（GET / POST / PUT / PATCH / DELETE） |
| `body` | string | — | — | リクエストボディ（JSON 文字列）|
| `buyerTag` | string | — | `eliza-agent-{timestamp}` | 監査ログ用タグ |

### 戻り値

```typescript
// 成功時
{ success: true, chargeId: string | null, amountUsdc: string | null }

// 失敗時
{ success: false, error: LemoncakeErrorCode, retryable?: boolean }
```

---

## 🔐 環境変数一覧

| 変数名 | 必須 | 説明 |
|---|:---:|---|
| `LEMONCAKE_PAY_TOKEN` | △ | 事前発行済み Pay Token JWT（クイックスタートモード） |
| `LEMONCAKE_BUYER_JWT` | △ | Buyer JWT（本番運用・都度発行モード） |
| `LEMONCAKE_API_URL` | — | API エンドポイント（デフォルト: `https://api.lemoncake.xyz`）|

> △ = `LEMONCAKE_PAY_TOKEN` または `LEMONCAKE_BUYER_JWT` のどちらか一方が必須です。
> どちらも未設定の場合、アクションは `validate()` で `false` を返し無効化されます。

---

## ❌ エラーコード一覧

| コード | retryable | 説明 |
|---|:---:|---|
| `CREDENTIAL_MISSING` | — | PAY_TOKEN / BUYER_JWT が未設定 |
| `INSUFFICIENT_BALANCE` | — | USDC 残高不足 |
| `TOKEN_LIMIT_EXCEEDED` | — | Pay Token の上限額に到達 |
| `TOKEN_EXPIRED` | — | Pay Token または Buyer JWT の有効期限切れ |
| `SERVICE_NOT_FOUND` | — | serviceId が存在しない |
| `SERVICE_NOT_APPROVED` | — | サービスが LemonCake 審査中 |
| `RATE_LIMITED` | ✅ | レート制限（`retryAfterSec` に待ち秒数あり） |
| `NETWORK_ERROR` | ✅ | ネットワーク接続失敗 |
| `API_ERROR` | — | その他の上流 API エラー |
| `PARSE_ERROR` | — | レスポンスのパース失敗 |

---

## 🏃 ローカル開発

```bash
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake/eliza-plugin-lemoncake

npm install
npm run build   # TypeScript → dist/
```

---

## 📐 アーキテクチャ

```
eliza-plugin-lemoncake/
├── src/
│   ├── index.ts               # lemoncakePlugin エクスポート（Plugin オブジェクト）
│   ├── types.ts               # 型定義・LemoncakeError クラス
│   ├── actions/
│   │   └── payAction.ts       # EXECUTE_LEMONCAKE_PAYMENT アクション
│   └── lib/
│       └── lemoncakeClient.ts # HTTP クライアント（Pay Token 発行 + proxy 呼び出し）
└── dist/                      # ビルド成果物（npm publish 対象）
```

### 決済フロー

```
Agent message
     │
     ▼
payAction.validate()
  └─ LEMONCAKE_PAY_TOKEN または LEMONCAKE_BUYER_JWT の存在確認
     │
     ▼
payAction.handler()
  ├─ 1. LLM パラメータ抽出（options.parameters）
  │     └─ 失敗時: メッセージテキストから正規表現フォールバック
  │
  ├─ 2. LemoncakeClient.resolvePayToken()
  │     ├─ LEMONCAKE_PAY_TOKEN あり → そのまま使用（API 呼び出しなし）
  │     └─ LEMONCAKE_BUYER_JWT のみ → POST /api/tokens → Pay Token 発行
  │
  ├─ 3. LemoncakeClient.callService()
  │     └─ ANY /api/proxy/:serviceId/:path
  │          Headers: Authorization: Bearer <payTokenJwt>
  │                   Idempotency-Key: <randomUUID>
  │
  └─ 4. レスポンス処理
        ├─ 成功: X-Charge-Id / X-Amount-Usdc ヘッダーから課金情報を取得
        └─ 失敗: LemoncakeErrorCode → 日本語エラーメッセージに変換して callback
```

---

## 🔗 関連リンク

- [LemonCake ダッシュボード](https://lemoncake.xyz/dashboard)
- [LemonCake API ドキュメント](https://lemoncake.xyz/docs)
- [ElizaOS](https://elizaos.ai)
- [GitHub](https://github.com/evidai/lemon-cake)

---

## 📄 ライセンス

MIT © [LemonCake](https://lemoncake.xyz)
