# LEMON cake Platform — AI Agent 向け機能概要

**Production Base URL:** `https://skillful-blessing-production.up.railway.app`

---

## プラットフォームとは

LEMON cake は **AI エージェント向け M2M（Machine-to-Machine）決済プラットフォーム**です。
エージェントは Pay Token を使って外部 API を呼び出すたびに自動課金され、プロキシ経由で実際の上流サービスに転送されます。

- **Buyer（エージェント）** — USDC 残高をチャージして API を利用
- **Provider** — API エンドポイントを登録し、コール単価を設定
- **Platform** — 課金・認証・プロキシ転送・税務・仕訳を一元管理

---

## 認証フロー（3ステップ）

### 1. Buyer 登録 / ログイン
```
POST /api/auth/register
{ "email": "agent@example.com", "password": "..." }

POST /api/auth/login
→ { "token": "<JWT>" }
```

### 2. Pay Token 発行
```
POST /api/tokens
Authorization: Bearer <JWT>
{ "serviceId": "<id>", "limitUsdc": "1.00", "ttlSeconds": 3600 }
→ { "token": "<payToken>" }
```

### 3. プロキシ経由で API 呼び出し
```
ANY /api/proxy/<serviceId>/<upstream-path>
Authorization: Bearer <payToken>
```

課金 → 上流転送 → レスポンスに `X-Charge-Id` / `X-Amount-Usdc` を付与。

---

## 利用可能サービス一覧

### 🇯🇵 日本向け有料サービス

| サービス名 | Service ID | 単価 (USDC) | エンドポイント |
|-----------|-----------|------------|--------------|
| freee 会計 API | `cmnytbqlj0002eg0nb3iunxlz` | $0.001000 | `https://api.freee.co.jp/api/1` |
| 国税庁 インボイス照合 | `cmnytbqnx0004eg0n0ssyutjo` | $0.000500 | `https://web-api.invoice-kohyo.nta.go.jp/api/1` |
| gBizINFO 法人情報 | `cmnyvz39h0002f6ac46bp70ij` | $0.000500 | `https://info.gbiz.go.jp/api/ene/v1` |
| e-Gov 法令検索 | `cmnyvz3bi0004f6ac5eed29m2` | $0.000300 | `https://laws.e-gov.go.jp/api/1` |

**freee 使い方:**
```
GET  /api/proxy/cmnytbqlj0002eg0nb3iunxlz/companies
POST /api/proxy/cmnytbqlj0002eg0nb3iunxlz/deals
```
OAuth トークンは自動更新（401 時にリフレッシュしてリトライ）。

**国税庁 使い方:**
```
GET /api/proxy/cmnytbqnx0004eg0n0ssyutjo/sealed/v01/matching?id=<appId>&number=T1234567890123
```

**gBizINFO 使い方:**
```
GET /api/proxy/cmnyvz39h0002f6ac46bp70ij/hojin/v1/hojin?name=<社名>
```

---

### 🌍 グローバル・コンプライアンス

| サービス名 | Service ID | 単価 (USDC) | 用途 |
|-----------|-----------|------------|------|
| Abstract VAT Validation | `cmnyw4bdh0002iwp0drq096qf` | $0.000200 | EU VAT 番号検証 |
| IPinfo Geolocation | `cmnyw4bfu0004iwp0hp4eyuu5` | $0.000100 | IP リスク判定 |
| Open Exchange Rates | `cmnyw4bi40006iwp0h320l3oi` | $0.000200 | リアルタイム為替 |
| Hunter.io | `cmnyw4bkh0008iwp0ylyua61u` | $0.000500 | 企業メール検索 |

---

### 🕷️ LLM ネイティブ・スクレイパー

| サービス名 | Service ID | 単価 (USDC) | 使い方 |
|-----------|-----------|------------|-------|
| Firecrawl | `cmnxgmxh2000472zrua2o1e95` | $0.000200 | `POST /api/proxy/<id>/scrape` |
| Jina Reader | `cmnywa5ey0002q5qe6t3gi7g9` | $0.000100 | `GET /api/proxy/<id>?url=https://example.com` |

> **Jina Reader 注意:** URL はパスではなく `?url=` クエリパラメータで渡す（HTTP クライアントの `//` 正規化を回避）。

---

### 🏢 Corporate & Legal（契約・本人確認）

| サービス名 | Service ID | 単価 (USDC) | 用途 |
|-----------|-----------|------------|------|
| CloudSign API | seed 時に自動採番 | $0.005000 | 電子契約送信・署名完了 Webhook |
| TRUSTDOCK eKYC | seed 時に自動採番 | $0.050000 | マイナンバー・身分証オンライン本人確認 |
| Slack | seed 時に自動採番 | $0.000100 | Human-in-the-loop エスカレーション |

---

### 📦 Physical Operations（物理業務）

| サービス名 | Service ID | 単価 (USDC) | 用途 |
|-----------|-----------|------------|------|
| Raksul API | seed 時に自動採番 | $0.001000 | 印刷・DM・グッズ自動発注 |
| AfterShip API | seed 時に自動採番 | $0.000500 | トラッキング番号で納品確認 |

---

### 🔍 検索・Web / 💻 コード実行 / 🤖 AI推論 / 🎙️ 音声 / 📝 テキスト / 📊 データ

（既存サービス一覧 — Service ID は `/api/services?reviewStatus=APPROVED` で取得）

---

## E2E Business Recipe — ワークフロー API

AIエージェントが「リサーチ → 契約 → 発注 → 納品確認 → 税務 → 支払い → 記帳」を1ウォレットで完結。

### ワークフロー開始
```
POST /api/workflows/e2e-procurement
Authorization: Bearer <JWT>
{
  "vendorName":    "株式会社テスト",
  "vendorEmail":   "vendor@example.com",
  "invoiceRegistrationNumber": "T1234567890123",
  "contractTitle": "業務委託契約",
  "orderDetails":  { "serviceType": "FREELANCE", "description": "デザイン制作" },
  "amountUsdc":    "100.000000",
  "amountJpy":     15000,
  "contractDocId": "<CloudSign doc ID>"   // 省略可: 後から PATCH で更新
}
→ { "workflowId": "<id>", "state": "RESEARCH" }
```

### 状態確認
```
GET /api/workflows/<workflowId>
→ { "state": "CONTRACTING", "heldUsdc": "100.000000", "context": { ... } }
```

### コンテキスト更新（非同期コールバック用）
```
PATCH /api/workflows/<workflowId>/context
{ "contractDocId": "...", "orderId": "...", "trackingNumber": "..." }
```

### ステートマシン
```
RESEARCH → CONTRACTING（CloudSign Webhook待ち）
         → ORDER_LOCKED（USDC与信ロック + 発注）
         → VERIFYING（AfterShip Webhook待ち）
         → TAX_PENDING（国税庁 + IPinfo 自動判定）
         → PAYING（USDC確定課金）
         → BOOKKEEPING（freee 仕訳自動作成）
         → COMPLETED
```

---

## 自動 KYB — 取引先審査 API

```
GET  /api/kyb/<corporateNumber(13桁)>
POST /api/kyb/check
     { "corporateNumber": "1234567890123",
       "invoiceRegistrationNumber": "T1234567890123",
       "requesterIp": "1.2.3.4" }
```

**リスクスコア → 判定:**
- 0–59: `APPROVED`（自動承認）
- 60–89: `REVIEW`（人間エスカレーション必要）
- 90+: `BLOCKED`（決済保留）

---

## GitHub Recipe — 自律型バウンティ Webhook

PR マージ時に自動的に外注費を freee に記帳。

```
POST /api/webhooks/github
X-Hub-Signature-256: sha256=<HMAC>
{ GitHub PR merged payload }
```

- 日本個人の場合: 源泉徴収 (10.21%) を自動計算して freee に「外注費」仕訳
- `GITHUB_BOUNTY_USDC` 環境変数で報酬単価を設定（デフォルト $50）

---

## 残高チャージ（Stripe 銀行振込）

```
POST /api/payments/checkout
Authorization: Bearer <JWT>
{ "amountUsdc": "10.00" }
→ { "url": "<Stripe Checkout URL>" }
```

---

## Webhook エンドポイント一覧

| サービス | Webhook URL |
|---------|-------------|
| CloudSign（署名完了） | `/api/webhooks/cloudsign` |
| AfterShip（納品完了） | `/api/webhooks/aftership` |
| GitHub（PR マージ）  | `/api/webhooks/github` |
| Stripe（振込完了）   | `/api/stripe/webhook` |

---

## エラーコード

| HTTP | 意味 |
|------|------|
| 401 | Pay Token 未指定または無効 |
| 402 | Buyer 残高不足 |
| 403 | Token がこのサービス用ではない / KYB BLOCKED |
| 202 | KYB REVIEW（人間確認が必要） |
| 404 | Service / Workflow が存在しない |
| 409 | Token 利用上限超過 / Workflow が既に終了状態 |
| 501 | サービスにエンドポイント未設定 |
| 502 | 上流 API 接続エラー |

---

*Last updated: 2026-04-16*
