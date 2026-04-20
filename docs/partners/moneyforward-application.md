# Money Forward クラウド会計 API パートナー申請 — 提出マテリアル

**提出先**: https://biz.moneyforward.com/support/expense/faq/api/a004.html （申請フォームリンク）
**申請タイプ**: API連携パートナー
**予想審査期間**: 3〜6週間

---

## 0. 事前準備チェックリスト

- [ ] Money Forward ビジネスアカウント作成
- [ ] API開発者ポータル登録申請（→ 登録完了まで約1週間）
- [ ] Client ID / Secret 取得（登録承認後にメール通知）
- [ ] OAuth リダイレクトURI確定 → `https://lemoncake.xyz/api/money-forward/callback`
- [ ] 実装: `api/src/lib/money-forward.ts` **完了** ✓
- [ ] サンドボックスで仕訳作成テスト（Client ID 取得後）

---

## 1. 基本情報

| フィールド | 値 |
|---|---|
| アプリ名 | LemonCake |
| 提供事業者名 | evidai |
| サービスURL | https://lemoncake.xyz |
| サポートメール | contact@aievid.com |
| プライバシーポリシー | https://lemoncake.xyz/legal/dify-plugin |
| 利用規約 | https://lemoncake.xyz/legal/terms |

---

## 2. 連携目的説明文（日本語）

```
LemonCake は、AIエージェントによる外部API決済の支払い情報を
Money Forward クラウド会計に自動仕訳する連携アプリです。
決済完了ごとに「外注費 / 通信費 ↔ 普通預金」の仕訳を生成し、
源泉徴収が必要な取引は預り金として按分、適格請求書発行事業者
チェック（国税庁API）も併記します。経理担当者の月次仕訳工数を
大幅削減しつつ、AI暴走による過剰請求リスクはPay Token上限で遮断します。
```

---

## 3. 利用APIエンドポイント

| メソッド | エンドポイント | 用途 |
|---|---|---|
| POST | `/api/v1/journals` | 仕訳伝票の自動作成 |
| POST | `/token` | OAuthトークン取得・リフレッシュ |
| GET  | `/api/v1/offices` | 事業所一覧取得（初回連携時のみ） |

**要求スコープ**: `mfc/invoice/data.write mfc/invoice/data.read office.read`

---

## 4. セキュリティ情報

freee 申請と同内容。`docs/partners/freee-application.md` §6 参照。

追加:
- Money Forward 専用トークンは freee と **別キーで暗号化保管** （キー混在を防ぐ）
- `ACCOUNTING_PROVIDER` 環境変数で freee / MF / 両方 を切替可能

---

## 5. 実装状態

```
api/src/lib/
├── freee.ts         # freee 連携（実装済・本番稼働）
├── money-forward.ts # Money Forward 連携（実装済・サンドボックステスト待ち）
└── accounting.ts    # 統合ディスパッチャ
```

コード: https://github.com/evidai/lemon-cake/tree/main/api/src/lib/money-forward.ts

---

## 6. サンドボックステスト計画（Client ID 取得後に実行）

1. `MF_CLIENT_ID` / `MF_CLIENT_SECRET` を Vercel Secrets に登録
2. OAuth 認可フロー実行 → Refresh Token 取得
3. テスト取引1件作成（1 USDC = 150 JPY 相当、源泉徴収なし）
4. Money Forward 管理画面で仕訳反映確認
5. 401エラー時の自動リフレッシュ動作確認
6. 源泉徴収あり取引で預り金按分確認
7. 適格請求書発行事業者チェック併記確認

テスト結果を申請時に添付（スクリーンショット or ログ）

---

## 7. 申請時の送信手順（Money Forward 開発者ポータル登録後）

1. 開発者ポータルにログイン
2. 「本番申請」フォーム選択
3. 本ドキュメントの値をコピペ
4. サンドボックステスト結果を添付
5. 送信 → 審査結果メールを3〜6週間待つ
