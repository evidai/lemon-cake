# 03 · ログ保存・削除ポリシー

## 1. ログ種別と保存期間

| ログ種別 | 保存場所 | 保存期間 | 主な内容 |
|---|---|---|---|
| **Dify 側プラグイン ログ** | Dify ワークスペース（導入企業所有） | Dify 側の設定に従う | ツール呼び出し記録・応答本文 |
| **LemonCake アクセス ログ** | Railway Logging (ap-northeast-1) | **30 日ローリング** | HTTP メソッド, path, status, Buyer ID, 所要ミリ秒 |
| **監査ログ (audit_logs)** | Postgres | **2 年間** | Pay Token 発行・revoke・課金・KYA 申請 |
| **課金レコード (charges)** | Postgres | **7 年間**（税務法定期限） | Service ID, 金額, Idempotency Key |
| **JPYC / USDC トランザクション** | Polygon チェーン | 恒久（ブロックチェーン特性） | ウォレット アドレス, amount, tx hash |
| **OAuth アクセス トークン** | Postgres (AES-256-GCM 暗号化) | 接続解除まで / ユーザー退会時に即削除 | freee / QuickBooks 等のリフレッシュ トークン |
| **バックアップ** | S3 互換ストレージ | 7 日間 | Postgres フル ダンプ |

## 2. ログに **含まれない** データ

- Dify の会話メッセージ（user / assistant テキスト）
- Dify の添付ファイル
- Pay Token の secret material（ペイロードのみログ、署名部は除外）
- Buyer の平文パスワード（bcrypt ハッシュのみ保存）
- 会計システムの仕訳内容の詳細（件数だけ監査ログに記録）

## 3. 削除リクエスト対応

### Buyer アカウント削除
1. ダッシュボードから **アカウント削除** をクリック
2. 30 日間の grace window（誤操作復旧用）
3. grace window 経過後:
   - `tokens`, `charges` → **完全削除**
   - `audit_logs` → Buyer ID を `[redacted]` に置換（改ざん検知のため件数は保持）
   - OAuth トークン → 即時削除
   - アクセス ログ → 30 日で自然失効

### 個別データ削除 (GDPR 第 17 条 / APPI 第 30 条)
- 書面 / email で contact@aievid.com 宛に請求
- 身元確認後 **30 日以内** に対応、対応完了を書面で通知

## 4. ログ アクセス権

| ロール | 参照可能なログ |
|---|---|
| Buyer 本人 | 自分の `tokens`, `charges`, `audit_logs` (ダッシュボード経由) |
| LemonCake 運用チーム | アクセス ログ（障害調査時のみ、監査可）、集計値 |
| 外部監査人 | 事前合意の下、匿名化ログ |
| 第三者 | **原則アクセス不可**（令状等の法的要請を除く） |

LemonCake 運用チームが個別 Buyer のデータにアクセスする場合、必ず `audit_logs` に `admin_access` として記録されます。

## 5. 法令遵守

- **個人情報保護法 (APPI)**: 第 28 条（越境移転）は SCC 準拠
- **GDPR**: Art. 6(1)(b) 契約履行 + Art. 6(1)(f) 正当利益を根拠
- **電子帳簿保存法**: 課金レコード 7 年保存で要件を満たす
- **インボイス制度**: 適格請求書発行事業者 公表サイトの照合結果キャッシュは 24 時間

## 6. ログ監査の再現性

導入企業の情シス / 内部監査が LemonCake 側ログを必要とする場合:

- 自社 Buyer ID に紐づく全アクセス ログの CSV エクスポートを **無料** で提供（月 1 回まで）
- API 経由の取得は roadmap（エンタープライズ プラン予定）
