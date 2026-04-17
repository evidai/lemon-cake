# LEMONCake Seller Integration Guide

AIエージェントにあなたのAPIを販売する — 登録から収益受取まで。

---

## 2つの統合パターン

| パターン | 向き | 工数 | 採用ケース |
|---------|------|------|----------|
| **REST API 登録** | 既存のREST APIをそのまま登録 | 30分 | 既にAPIがある場合 |
| **MCP Server 公開** | MCPサーバーとして公開 | 2〜4時間 | Claude/Cursorから直接呼ばれたい場合 |

どちらもLEMONCakeのプロキシを通じて課金されるため、**あなたのAPIに課金ロジックを追加する必要はありません。**

---

## Pattern A: REST API を登録する

### Step 1: OpenAPIドキュメントを用意する

`docs/seller-openapi-template.yaml` をコピーして、あなたのAPIに合わせて編集します。

**LLM向けに書くポイント:**

```yaml
# ❌ 人間向け（エージェントが使いにくい）
description: "検索機能"

# ✅ LLM向け（エージェントが適切に使える）
description: |
  コーポレートサイトのコンテンツを全文検索します。
  
  使うべき場面:
  - ユーザーが企業情報を調べているとき
  - キーワードに関連するニュースが必要なとき
  
  返り値: score が高い順に並んだ結果リスト。
  score > 0.8 なら関連性が高い。
```

### Step 2: プロバイダー登録

```bash
# 1. LEMONCakeダッシュボードでプロバイダー登録
# https://lemoncake.xyz/dashboard → "セラーとして登録"

# 2. APIキーでサービスを登録
curl -X POST https://api.lemoncake.xyz/api/services \
  -H "Authorization: Bearer <provider_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Search API",
    "type": "API",
    "endpoint": "https://api.your-service.com/v1",
    "pricePerCallUsdc": "0.001",
    "openApiUrl": "https://your-service.com/openapi.yaml"
  }'
# → { "id": "svc_xxx", "reviewStatus": "PENDING" }
```

### Step 3: LEMONCakeプロキシに対応する

LEMONCakeはあなたのAPIを呼び出す際、以下のヘッダーを付与します。

```http
X-LEMONCake-Buyer-Id: buyer_xxx      # 呼び出し元バイヤーID
X-LEMONCake-Token-Id: tok_xxx        # Pay Token ID（監査ログ用）
X-LEMONCake-Request-Id: req_xxx      # リクエスト追跡ID
```

レスポンスには以下を返してください:

```http
# 成功時
HTTP 200
X-Price-Per-Call: 0.001    # 今回の課金額（オプション。動的価格の場合に使用）

# エラー時（機械可読なコードを必ず含める）
HTTP 400
{ "error": "...", "code": "INVALID_PARAMETER" }
```

### Step 4: Webhookで収益を確認する

```bash
# 課金完了Webhookを登録（LEMONCakeダッシュボード → Webhook設定）
# エンドポイント: https://your-service.com/webhooks/lemoncake

# Webhookペイロード例
{
  "event": "charge.completed",
  "chargeId": "ch_xxx",
  "serviceId": "svc_xxx",
  "amountUsdc": "0.001",
  "buyerId": "buyer_xxx",
  "requestId": "req_xxx",
  "timestamp": "2026-04-17T10:00:00Z"
}
```

---

## Pattern B: MCPサーバーを公開する

MCPサーバーとして公開すると、Claude Desktop や Cursor から **コードなしで直接呼び出せる** ようになります。

### Step 1: テンプレートをコピー

```bash
cp -r mcp-server/seller-template my-service-mcp
cd my-service-mcp
npm install
```

### Step 2: カスタマイズ

`src/index.ts` を編集します。最低限変更が必要な箇所:

```typescript
// ① サービス名・バージョン
const SERVICE_NAME    = "your-actual-service-name";
const SERVICE_VERSION = "1.0.0";

// ② 環境変数名
const API_KEY = process.env.YOUR_ACTUAL_API_KEY ?? "";

// ③ ツール定義（ListToolsRequestSchema ハンドラー内）
{
  name: "your_tool",
  description: `
    [LLMが読む説明 — 「いつ使うか」「何が返るか」「料金は」を書く]
  `,
  inputSchema: {
    type: "object",
    required: ["param"],
    properties: {
      param: { type: "string", description: "パラメータの説明" }
    }
  }
}

// ④ ツール実装（CallToolRequestSchema ハンドラー内）
case "your_tool": {
  const result = await callApi("/your-endpoint", {
    method: "POST",
    body: { param: args.param }
  });
  if (!result.ok) return handleApiError(result.status, result.data);
  return json(result.data);
}
```

### Step 3: ビルド & テスト

```bash
npm run build

# ローカルで動作確認
YOUR_API_KEY=your_key node dist/index.js

# Claude Desktop で確認
# claude_desktop_config.json に追加:
{
  "mcpServers": {
    "your-service": {
      "command": "node",
      "args": ["/path/to/your-service-mcp/dist/index.js"],
      "env": { "YOUR_API_KEY": "your_key" }
    }
  }
}
```

### Step 4: npm に公開（オプション）

```bash
# package.json の name を @your-org/your-service-mcp に変更
npm publish --access public

# ユーザーは npx で即起動できる
npx -y @your-org/your-service-mcp
```

### Step 5: LEMONCakeに登録

```bash
curl -X POST https://api.lemoncake.xyz/api/services \
  -H "Authorization: Bearer <provider_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Your Service",
    "type": "MCP",
    "endpoint": "https://your-service.com/mcp",
    "pricePerCallUsdc": "0.001",
    "mcpPackage": "@your-org/your-service-mcp"
  }'
```

---

## 収益モデル

| 項目 | 内容 |
|------|------|
| 課金タイミング | リクエスト成功時（2xx）のみ |
| 精算周期 | 月次（毎月末日） |
| 受取通貨 | USDC（Polygon） |
| プラットフォーム手数料 | 売上の15% |
| 最低支払額 | $10 USDC |

---

## エージェントフレンドリーAPIのチェックリスト

登録前に確認してください:

### 必須
- [ ] 全エンドポイントに `description` がある（LLM向けに書いてある）
- [ ] 全パラメータに `description` と `example` がある
- [ ] エラーレスポンスに機械可読な `code` フィールドがある
- [ ] `402 Payment Required` を返す場合は `code: "BUDGET_EXCEEDED"` を含める
- [ ] レート制限時は `Retry-After` ヘッダーを返す

### 推奨
- [ ] `/health` エンドポイントがある（認証不要・課金なし）
- [ ] 冪等キー（`Idempotency-Key`）に対応している
- [ ] レスポンスに `requestId` を含める（デバッグ用）
- [ ] OpenAPI 3.1 ドキュメントが公開されている

### LLM最適化
- [ ] `description` に「いつ使うか」「いつ使わないか」を書いた
- [ ] `example` に現実的な値を入れた
- [ ] エラーメッセージが英語または日本語で書かれている
- [ ] 結果にスコアや信頼度フィールドがある（エージェントが判断しやすい）

---

## よくある質問

**Q. 既存のAPIの認証をどう扱いますか？**

LEMONCakeはあなたのAPIを呼び出す際、`X-LEMONCake-Token-Id` ヘッダーで正当性を保証します。あなたのAPIでは `X-LEMONCake-Secret`（Webhookシークレット）を検証することで、LEMONCake経由のリクエストを確認できます。

**Q. 動的な価格設定はできますか？**

はい。レスポンスヘッダーに `X-Price-Per-Call: 0.005` を返すと、その呼び出し分の課金額をオーバーライドできます（登録時の価格の±10倍の範囲内）。

**Q. テスト用の環境はありますか？**

Sandboxモードで登録すると、実際の課金が発生しないテスト環境で動作確認できます。LEMONCakeダッシュボード → サービス設定 → Sandboxモード。

**Q. MCPサーバーとREST APIの両方を登録できますか？**

できます。同じサービスに対して `type: "API"` と `type: "MCP"` の両方を登録することで、バイヤーが好みの方法で利用できます。
