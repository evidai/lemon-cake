# 01 · データフロー図

LemonCake for Dify プラグインを使った際、どのコンポーネントからどのデータがどこへ流れるかを明示します。

## 全景

```
┌────────────┐    ①      ┌───────────┐    ②      ┌───────────────────┐
│ Dify       │ ─────────→ │ LemonCake │ ─────────→ │ Upstream API      │
│ workflow   │            │ Proxy     │            │ (jina-reader etc.)│
│ + LLM      │ ←───────── │           │ ←───────── │                   │
└────────────┘    ④       └───────────┘    ③       └───────────────────┘
      │                         │
      │ ⑤ Buyer JWT             │ ⑥ 自動仕訳・税務
      ▼                         ▼
┌────────────┐           ┌───────────────────┐
│ Dify 暗号化 │           │ freee / QuickBooks│
│ Credential │           │ / Xero / 国税庁 API│
│ Store      │           └───────────────────┘
└────────────┘
```

## 各区間で流れる情報

### ① Dify → LemonCake（本プラグインが送信するデータ）

| 呼び出し | 送信フィールド | それ以外 |
|---|---|---|
| `issue_pay_token` | `serviceId` `limitUsdc` `expiresInSeconds` `sandbox` | `Authorization: Bearer <Buyer JWT>` |
| `check_balance` | （なし） | `Authorization: Bearer <Buyer JWT>` |
| `revoke_token` | `tokenId` | `Authorization: Bearer <Buyer JWT>` |
| `list_charges` | `limit` | `Authorization: Bearer <Buyer JWT>` |

**会話内容・ユーザー メッセージ・添付ファイル・その他ツール出力は一切送信しません。** プラグインのソース コードで確認可能（< 200 行）: [GitHub](https://github.com/evidai/lemon-cake/tree/main/integrations/dify/lemoncake/tools)

### ② LemonCake → Upstream API

Pay Token を Bearer として、LemonCake Proxy がアップストリーム API (jina-reader, openai-search 等) に転送。上流 API キーは **LemonCake サーバーを離れません**。Dify にも渡りません。

### ③ Upstream API → LemonCake Proxy

API 応答をそのまま返却。LemonCake 側で課金額（USDC / JPYC）と冪等性キーを記録。

### ④ LemonCake → Dify

- プラグイン経由の応答には: Pay Token メタデータ / 残高 / 課金レコード のみ含まれる
- プロキシ経由の応答には: 上流 API の生レスポンス + `X-Charge-Id` / `X-Amount-Usdc` ヘッダ

### ⑤ Buyer JWT の保管

- Dify の暗号化クレデンシャル ストアに保存（Dify 運用者が管理）
- プラグインは再起動時もこのストアから読み出し、**ローカルディスクにもメモリ以外にも書き込みません**
- 漏えい時は LemonCake ダッシュボードから即座に revoke 可能

### ⑥ LemonCake → 会計 / 税務（Buyer が明示的に接続した場合のみ）

| 外部サービス | 連携方式 | 何を送信 |
|---|---|---|
| freee | OAuth 2.0 | 仕訳データ（日付・勘定科目・金額・摘要） |
| QuickBooks / Xero / Zoho / Sage / NetSuite | OAuth 2.0 (NetSuite のみ OAuth 1.0a) | 同上 |
| 国税庁 Web-API | キー不要パブリック API | 登録番号 T + 13桁（個人情報ではない） |

Buyer がこれらを **明示的に OAuth 接続しない限り送信しません**。Dify プラグインからはこれらのサービスへのデータ送信は一切発生しません。

## データ主権（サーバー所在地）

| コンポーネント | リージョン | 備考 |
|---|---|---|
| Dify ワークスペース | 導入企業の指定 | 企業側で選択 |
| LemonCake API | ap-northeast-1 (東京) | Railway 上のマネージド Postgres + Node |
| LemonCake ワーカー | ap-northeast-1 | JPYC/USDC 決済処理 |
| Polygon ノード | パブリック チェーン | 決済レイヤーのみ、個人情報なし |
| ログ保存 | ap-northeast-1 | 30 日ローリング |

フェイルオーバー時のみ us-east-1 にトラフィックが移る可能性あり。**データ越境は SCC / APPI 第 28 条準拠**（詳細は [04-compliance-status.md](./04-compliance-status.md)）。
