# 02 · セキュリティ ホワイトペーパー

## 目次
1. 認証・認可
2. 暗号化
3. Kill Switch の原子性
4. 冪等性（idempotency）
5. 脅威モデル
6. ペネトレーション テスト / バグバウンティ

---

## 1. 認証・認可

### Buyer JWT
- 署名方式: **HMAC-SHA256 (HS256, RFC 7518)**
- 署名鍵: LemonCake API サーバー側で管理する共有秘密鍵（環境変数 `JWT_SECRET`、Railway Managed Secrets 経由で注入、at-rest 暗号化）
- 検証: API サーバー内で毎回ローカル検証（外部鍵サーバーへの呼び出しなし）
- クレーム: `sub` (Buyer ID), `iat`, `exp`, `jti`, `serviceId`, `limitUsdc`, `sandbox`
- ロードマップ: v0.1.0 で **Ed25519 非対称鍵** に移行予定（外部サービスが共有秘密なしで検証可能に）

### Pay Token
- 同じ HS256 鍵で署名された子 JWT
- 親 Buyer JWT の権限を継承しつつ、`limitUsdc` と `expiresInSeconds` でさらに制限
- `jti` を使った revoke list チェックで Kill Switch に対応

### Dify プラグイン側
- プラグインは Buyer JWT を **Dify 暗号化クレデンシャル ストア** に保存
- ソース コードは `integrations/dify/lemoncake/` 以下で完全公開
- プラグイン自体が鍵を生成したり署名したりすることはない（単なる HTTP クライアント）

---

## 2. 暗号化

### 転送時 (in transit)
- TLS 1.2 以上、HTTP/2 推奨
- HSTS 強制（`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`）

### 保存時 (at rest)
- Postgres: AES-256 による自動暗号化（Railway Managed Postgres）
- 会計連携 OAuth トークン: アプリ層で AES-256-GCM 二重暗号化（鍵は `ACCOUNTING_TOKEN_SECRET`）
- バックアップ: 同じ鍵で暗号化、7 日間保持、S3 バージョニング

### 鍵管理
- JWT 署名鍵: 環境変数経由で注入、四半期ごと ローテーション
- 漏えい検知時: 鍵ローテーションで既存 Pay Token を全て無効化 (< 60 秒)

---

## 3. Kill Switch の原子性

`PATCH /api/tokens/{id}/revoke` は単一の SQL ステートメントで実装:

```sql
UPDATE tokens
SET revoked = true, revokedAt = NOW()
WHERE id = $1
  AND buyerId = $2
  AND revoked = false
RETURNING id
```

- **race-condition-free**: in-flight の課金リクエストと同時に revoke が走っても、どちらか一方だけが成功（Postgres の MVCC）
- 結果が空行なら既に revoke 済み → `409 Conflict`
- 存在しない ID → `404 Not Found`
- 他 Buyer のトークン → `404`（所有権漏えい防止）

これにより「暴走したエージェントを止めきれない」リスクが構造的に排除されます。

---

## 4. 冪等性

`POST /api/charges` は `Idempotency-Key` ヘッダ必須。同じキーで 2 回呼ばれた場合:
- 1 回目: 課金実行、レコード保存
- 2 回目: 保存済みレコードを返却、USDC の二重移動なし

DB 制約: `UNIQUE (buyerId, idempotencyKey)` で保証。

---

## 5. 脅威モデル

| 脅威 | 影響 | 緩和策 |
|---|---|---|
| Buyer JWT 漏えい | 攻撃者が Pay Token を発行可能 | ダッシュボード / API から即時 revoke / 鍵ローテーション |
| Pay Token 漏えい | その Token の limit 内で課金可能 | `limit` と `expiry` で損害上限固定 / Kill Switch |
| リプレイ攻撃 | 同じ請求が複数回 | `Idempotency-Key` で冪等性保証 |
| SQL インジェクション | DB 破壊 / 情報漏えい | Prisma ORM パラメタ化クエリのみ使用 |
| SSRF（プロキシ経由） | 内部 API への攻撃 | 許可リスト方式、`allow_private_networks=false` |
| 暴走エージェント | 予算超過 / 不正利用 | Kill Switch + 日次 KYA 上限 + サンドボックス モード |
| プラグイン内の悪意コード | Dify ワークスペース侵害 | ソース公開 + `manifest.yaml` レビュー + Dify plugin signing |

---

## 6. 外部レビュー

- **ソース コード レビュー歓迎**: [GitHub](https://github.com/evidai/lemon-cake) Issues / PR で受付
- **バグバウンティ**: launch 後 3 ヶ月でローンチ予定（Hackenproof 経由）
- **Dify Plugin Signature**: 公式 Partner 認定後に取得予定

## 質問窓口

- セキュリティ問題の非公開報告: contact@aievid.com（PGP 鍵は要望があれば提供）
- 一般質問: https://github.com/evidai/lemon-cake/issues
