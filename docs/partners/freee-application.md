# freee アプリストア パートナー申請 — 提出マテリアル

**提出先**: https://app.secure.freee.co.jp/developers/applications
**申請タイプ**: 公開アプリ（アプリストア掲載）
**予想審査期間**: 2〜4週間

---

## 0. 事前準備チェックリスト

- [ ] freee 開発者アカウント作成（https://developer.freee.co.jp/）
- [ ] 事業所ID 取得（本番用）
- [ ] プライバシーポリシーURL 公開済み → `https://lemoncake.xyz/legal/dify-plugin`
- [ ] 利用規約URL 公開済み → `https://lemoncake.xyz/legal/terms`（**未作成の場合は先に作成**）
- [ ] アプリアイコン 256×256 PNG 用意 → `integrations/dify/lemoncake/_assets/icon.svg` をPNG化
- [ ] アプリスクリーンショット 3〜5枚用意

---

## 1. 基本情報

| フィールド | 値 |
|---|---|
| アプリ名 | LemonCake |
| アプリ名（英語） | LemonCake |
| 提供事業者名 | evidai（株式会社化予定の場合は法人名に変更） |
| カテゴリ | 決済・入金 / 経費・精算 |
| 対応プラン | ミニマム / ベーシック / プロフェッショナル / エンタープライズ |
| アプリURL | https://lemoncake.xyz |
| サポートURL | https://lemoncake.xyz/support |
| プライバシーポリシー | https://lemoncake.xyz/legal/dify-plugin |
| 利用規約 | https://lemoncake.xyz/legal/terms |
| サポートメール | contact@aievid.com |

---

## 2. アプリ説明文（日本語・300字以内）

```
LemonCake は、AIエージェントに「上限付きの財布」を持たせる決済インフラです。
エージェントが外部APIを呼び出す際、事前に発行した Pay Token（HMAC-SHA256署名、
利用上限・有効期限付き）で支払いを行い、決済完了後に freee へ自動で仕訳を作成します。
源泉徴収が必要な取引は預り金として科目按分し、適格請求書発行事業者チェック
（国税庁API連携）も自動化。経理担当者の手作業をゼロにしながら、AI暴走による
過剰請求を上限値でブロックします。
```

## 3. アプリ説明文（英語・500字以内）

```
LemonCake is a payment infrastructure that gives AI agents a spend-capped wallet.
When an agent calls a paid external API, it pays via a Pay Token (HMAC-SHA256 signed,
with spend cap and expiry) issued in advance. Upon settlement, LemonCake automatically
creates a journal entry in freee, splitting withholding tax into the correct account
and verifying qualified-invoice issuer status via the NTA API. Finance teams get
zero-touch bookkeeping while engineering teams get a hard kill-switch against runaway
agent spending.
```

---

## 4. 連携する freee API エンドポイント

| メソッド | エンドポイント | 用途 |
|---|---|---|
| POST | `/api/1/deals` | 決済完了時に仕訳（取引）を自動作成 |
| POST | `/public_api/token` | OAuthトークン取得・リフレッシュ |
| GET  | `/api/1/companies` | 事業所ID取得（初回連携時のみ） |
| GET  | `/api/1/account_items` | 勘定科目マスタ取得（同期用） |

**要求スコープ**: `read write`

---

## 5. データフロー図

```
[ AIエージェント ]
       │  Pay Token (HMAC-SHA256 署名)
       ▼
[ LemonCake API ]  ──→  [ 上流API（有料サービス）]
       │  決済確定
       ▼
[ 仕訳生成エンジン ]
       │  freee API (POST /api/1/deals)
       ▼
[ freee 会計 ]
```

詳細: `docs/dify/audit-kit/01-data-flow.md` 参照

---

## 6. セキュリティ・コンプライアンス

| 項目 | 状態 |
|---|---|
| 通信暗号化 | TLS 1.3（HTTPS強制） |
| トークン保管 | Vercel Secrets（AES-256暗号化） |
| OAuthトークン | リフレッシュトークンは暗号化DB保管、アクセストークンはメモリ＋DBローテ |
| 監査ログ保持期間 | 90日 |
| SOC2 Type I | 2026年Q3取得予定 |
| GDPR / 個人情報保護法 | 遵守（DPA雛形あり `docs/dify/audit-kit/07-dpa-template.md`） |
| 脆弱性開示方針 | security@lemoncake.xyz（90日coordinated disclosure） |

監査キット一式: https://github.com/evidai/lemon-cake/tree/main/docs/dify/audit-kit

---

## 7. スクリーンショット仕様（5枚）

1. **Dify ワークフロー画面** — LemonCake ノードが組み込まれた例（demo.svg の第1フレーム活用）
2. **Pay Token 発行UI** — 上限・有効期限設定画面
3. **freee 仕訳自動生成画面** — 決済完了→仕訳作成のログ
4. **ダッシュボード** — 残高・直近決済・Kill Switch ボタン
5. **freee 側に作成された取引明細** — 実際の仕訳結果

**撮影TODO**: dashboard の本番デモアカウントで撮影 → PNG 1920×1080

---

## 8. 申請フォーム送信手順

1. https://app.secure.freee.co.jp/developers/applications にログイン
2. 「新しいアプリを作成」→ 本ドキュメントの値をコピペ
3. OAuth設定:
   - リダイレクトURI: `https://lemoncake.xyz/api/freee/callback`
   - スコープ: `read write`
4. スクリーンショット5枚アップロード
5. プライバシー/利用規約URL 入力
6. 「アプリストアに申請する」ボタンクリック
7. 審査結果メールを待つ（2〜4週間）

---

## 9. 審査で聞かれやすい項目（事前回答）

**Q: ユーザーのfreeeデータをどこまで参照しますか？**
A: 仕訳作成API (`POST /api/1/deals`) と事業所情報のみ。取引履歴の一覧取得・顧客マスタ参照は行いません。

**Q: アクセストークンの保管方法は？**
A: Vercel Secrets で AES-256 暗号化保管。DBには暗号化された状態でのみ保存。メモリ上のトークンはプロセス終了時に消去。

**Q: 連携解除時のデータ削除ポリシーは？**
A: ユーザーが連携解除した時点で、そのユーザーに紐づくアクセストークン・リフレッシュトークンを即時DB削除。仕訳データは freee 側に残り、LemonCake は複製保管しません。

**Q: 障害時の対応フローは？**
A: `docs/dify/audit-kit/05-incident-response.md` に規定。1時間以内に status page 掲載、4時間以内にユーザー通知、90日以内に root cause 公開。
