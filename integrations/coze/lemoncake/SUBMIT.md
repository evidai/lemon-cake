# Coze Plugin Store 提出手順

Coze には Dify のような **GitHub PR 経由の公開** は存在せず、**Coze 公式 Web UI で作成 → 公開申請 → Coze スタッフ審査** というフローになります。本リポジトリの `manifest.json` + `openapi.yaml` を Web UI に貼り付けて作業します。

## 前提

- Coze アカウント（海外向けは https://www.coze.com / 中国向けは https://www.coze.cn）
- `api.lemoncake.xyz` が公開 HTTPS で到達可能（本番デプロイ済み）
- Buyer JWT を 1 本用意（テスト用、`limitUsdc: "0.01"` で発行）

> **コツ:** 海外向けとして `coze.com`（英語）→ 中国向けに `coze.cn`（中国語）の順で 2 回提出するのが一般的。両方に同一コードベース（`manifest.json` + `openapi.yaml`）で対応できます。

---

## 方法 A — OpenAPI 一括インポート（推奨）

1. Coze ワークスペースにログイン
2. 左サイドバー **プラグイン** → **プラグインを作成** → **Import from OpenAPI** / **OpenAPI からインポート** を選択
3. `integrations/coze/lemoncake/openapi.yaml` をアップロード
4. 認証タイプ: **Service (API Key)** を選択
   - Location: `Header`
   - Parameter name: `Authorization`
   - Value prefix: `Bearer ` （末尾のスペース込み）
5. プラグイン情報を入力
   - Name: `LemonCake`
   - Description (EN): `M2M payment infra for AI agents — spend-capped Pay Tokens, kill switch, auto accounting sync.`
   - Description (ZH): `面向 AI Agent 的机对机支付基础设施 — 限额支付令牌、紧急停机、自动对账。`
   - Logo: `public/logo.png` をアップロード（512x512 PNG）
   - Contact email: `contact@aievid.com`
   - Legal info URL: `https://lemoncake.xyz/legal/dify-plugin`
6. 自動生成された 4 ツールの説明を確認：
   - `issue_pay_token` — Mint a spend-capped Pay Token
   - `check_balance` — Get current USDC balance
   - `revoke_token` — Atomically revoke a Pay Token (kill switch)
   - `list_charges` — List recent charges for reconciliation
7. **テスト** タブで各ツールを実行（Buyer JWT を入力）
   - `check_balance` が `200` を返すこと
   - `issue_pay_token` で `serviceId: "test-service"`, `limitUsdc: "0.01"` が成功すること
   - `revoke_token` で上で発行した `tokenId` を指定し `200` が返ること
8. **保存** → **公開** → Plugin Store への公開申請

---

## 方法 B — 手動作成（OpenAPI インポートが使えない場合）

1. **プラグインを作成** → **API サービスから作成**
2. Base URL: `https://api.lemoncake.xyz`
3. 認証: Service / API Key（方法 A と同じ設定）
4. **ツールを追加** を 4 回繰り返す：

| ツール | Method | Path | パラメータ |
|---|---|---|---|
| issue_pay_token | POST | /api/tokens | body: serviceId (str), limitUsdc (str), expiresInSeconds (int, opt), sandbox (bool, opt) |
| check_balance   | GET  | /api/auth/me | なし |
| revoke_token    | PATCH | /api/tokens/{tokenId}/revoke | path: tokenId (str) |
| list_charges    | GET  | /api/charges | query: limit (int, default 20) |

各ツールの説明は `openapi.yaml` 内の `description` 欄から転記します。

---

## 審査ポイント（Coze 運営が確認する項目）

| 項目 | 本プラグインの対応 |
|---|---|
| API の稼働性 | `api.lemoncake.xyz` は 99.5% 目標 SLA で常時稼働 |
| Privacy Policy URL | https://lemoncake.xyz/legal/dify-plugin が到達可能 |
| ロゴ（512x512 PNG） | `/public/logo.png` を使用 |
| ツール説明の明瞭性 | 各 tool に英中日 3 言語で description あり |
| エラー レスポンス | 4xx/5xx で構造化 JSON、`error.message` + `error.code` |
| 不適切コンテンツの非含有 | 決済インフラのみ、ユーザー生成コンテンツを扱わない |

---

## 審査後のタイムライン

- 提出から 3〜7 日で初回レビュー
- 典型的な指摘:
  - logo のサイズ超過 (>1MB)
  - description が model 用と human 用で内容が不一致
  - テスト時に `401` が返る（Buyer JWT の検証エンドポイントに到達しない）
- 承認後、Coze Plugin Store の検索に反映されるまで 1〜2 日

---

## 更新フロー

API を追加・変更した場合、このリポジトリで `openapi.yaml` を編集 → Coze UI の **プラグインを編集** → **OpenAPI を再インポート** で差分取り込み → **バージョン発行** で新版を公開します。

Coze は古いバージョンを指定したボットを動かし続けるため、既存ユーザーへの影響は最小です。
