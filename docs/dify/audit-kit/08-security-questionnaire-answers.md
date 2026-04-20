# 08 · セキュリティ アンケート 回答集

情シス/情報セキュリティ部門が利用する代表的なベンダー評価アンケート（SIG-Lite / CAIQ / 情報セキュリティ対策ベンチマーク / 経産省「クラウドサービス利用のための情報セキュリティマネジメントガイドライン」チェック項目）に対して、**そのままコピー&ペースト可能な回答**を用意しました。

> **使い方:** 自社のフォーマットに合わせて該当行の「回答」列を貼り付けてください。質問文言が微妙に違っても、最下部の索引から近い回答を探せます。

---

## A. 会社・契約情報

| 質問 | 回答 |
|---|---|
| ベンダー名 / 運営会社 | 合同会社 evidai（LemonCake 運営） |
| 所在地 | 日本 東京都 |
| 設立年 | 2025 年 |
| 資本金 | 申込時に開示 |
| 帝国データバンク / 東京商工リサーチ コード | 申込時に開示 |
| 主要株主 | 非公開（全株式創業者保有） |
| 再委託先 | Railway Inc. (米), Polygon Labs (分散), freee 他会計ベンダー（顧客接続時のみ）。詳細: [07-dpa-template.md](./07-dpa-template.md) |
| 契約主体 | 合同会社 evidai |
| 問合せ窓口 | contact@aievid.com |

## B. データ保護・プライバシー

| 質問 | 回答 |
|---|---|
| 個人情報の取扱い有無 | 原則なし（Buyer ID は内部 UUID、氏名・メール等の PII は本プラグインからは送信されない） |
| 個人情報保護法 (APPI) 対応 | 対応済み（2022 改正版準拠、第 28 条 越境移転要件を含む） |
| GDPR 対応 | DPA 提供可（[07-dpa-template.md](./07-dpa-template.md)）、SCC 準拠 |
| CCPA 対応 | 対応済み（米国ユーザ向け Privacy Rights ページ公開） |
| データ主権 | `ap-northeast-1`（東京）を第一リージョンとして利用 |
| 越境移転 | 障害時フェイルオーバー以外は発生しない |
| PII の暗号化 | 保存時 AES-256、転送時 TLS 1.2+ |
| データ削除 SLA | 契約終了後 30 日以内（法定保存分を除く） |
| 匿名化 | 課金レコードは 7 年保存後、Buyer ID を不可逆ハッシュ化 |

## C. アクセス制御・認証

| 質問 | 回答 |
|---|---|
| 認証方式 | Buyer JWT（HMAC-SHA256 署名、v0.1.0 で Ed25519 に移行予定） |
| MFA 対応 | Buyer ダッシュボード ログインは Google OAuth（MFA 継承）。Enterprise で SAML 2.0 / Okta 連携予定 |
| 最小権限原則 | Buyer 単位で分離、Pay Token で scope（serviceId + 上限額）を更に細分化 |
| セッション タイムアウト | ダッシュボード: 24h、Pay Token: 発行時に `expiresInSeconds` で明示 |
| 鍵ローテーション | ダッシュボードから 1 クリック、API 経由も可 |
| 退職者アカウントの無効化 | Buyer 組織オーナーが即時 revoke 可能 |
| 特権アカウント管理 | LemonCake 側の本番 DB アクセスは 2 名承認制、全操作 `audit_logs` に記録 |

## D. ネットワーク・インフラ

| 質問 | 回答 |
|---|---|
| 通信の暗号化 | TLS 1.2+ 強制、HSTS 有効、TLS 1.3 推奨 |
| ファイアウォール | Cloudflare 前段 + Railway 内部 ACL |
| DDoS 対策 | Cloudflare WAF（L7）+ レート制限（Buyer あたり 100 req/min） |
| 侵入検知 (IDS/IPS) | Cloudflare Bot Fight Mode + 独自異常検知（24/7 on-call） |
| 仮想化・コンテナ分離 | Railway Managed（SOC 2 Type II 取得済み） |
| エンドポイント保護 | 従業員端末: MDM + EDR（CrowdStrike） |
| VPN / ゼロトラスト | 本番環境アクセスは Tailscale 経由のみ |

## E. アプリケーション セキュリティ

| 質問 | 回答 |
|---|---|
| SDLC にセキュリティ組込み | GitHub Actions で静的解析 + Dependabot + テスト強制 |
| OWASP Top 10 対策 | 全項目対応、特に SSRF / IDOR は手動レビュー対象 |
| ペネトレ テスト | 2026 Q2 に Hackenproof 経由で実施予定 |
| バグ バウンティ | 2026 Q3 開始予定 |
| コード レビュー | PR 必須、2 名承認（セキュリティ関連は CISO 相当承認必須） |
| シークレット管理 | Railway Env + sealed secrets、git に平文なし |
| SBOM | `npm sbom` + `pip freeze` を CI で生成、リリース毎にアーカイブ |

## F. 監視・ログ・インシデント

| 質問 | 回答 |
|---|---|
| ログ保存期間 | アクセス 30 日 / 監査 2 年 / 課金 7 年（[03](./03-log-retention-policy.md)） |
| ログ改ざん対策 | 2026 Q3 にハッシュ チェーン実装予定、現在は append-only + 日次 S3 バックアップ |
| SIEM 連携 | Enterprise プランで Datadog / Splunk / Sumo Logic への転送対応 |
| インシデント通知 SLA | P0: 1 時間 / P1: 4 時間 / 重大: 96 時間以内ポストモーテム（[05](./05-incident-response.md)） |
| 過去 12 ヶ月の重大事故 | 該当なし（launch 直後） |
| Kill Switch | ダッシュボード + `revoke_token` API で即時停止、原子的 UPDATE で in-flight 課金もブロック |

## G. 事業継続・可用性

| 質問 | 回答 |
|---|---|
| SLA | 99.5%（無償）、契約で 99.9% まで調整可 |
| RTO | 4 時間 |
| RPO | 15 分（continuous WAL backup） |
| DR テスト頻度 | 四半期毎 |
| バックアップ | 同一リージョン暗号化、7 日間保持、月 1 回の復元テスト |
| データセンター冗長化 | Railway（US-East + EU-West + ap-northeast-1） |
| 緊急時連絡網 | contact@aievid.com + status.lemoncake.xyz、Enterprise は電話 24/7 |

## H. 人的・組織セキュリティ

| 質問 | 回答 |
|---|---|
| 従業員数 | 10 名未満（創業チーム） |
| セキュリティ教育 | 入社時 + 年 1 回、フィッシング演習含む |
| 秘密保持契約 | 全従業員・委託先と締結 |
| バックグラウンド チェック | 採用時に実施 |
| 退職時の手続き | 即日アクセス無効化 + 機器返却 + 秘密保持継続義務 |
| CISO / 責任者 | 共同創業者 2 名が兼任（Enterprise プランで専任 CISO アサイン可） |

## I. 法令遵守・第三者認証

| 質問 | 回答 |
|---|---|
| ISO/IEC 27001 | 2026 Q4 取得予定 |
| SOC 2 Type I | 2026 Q3 取得予定 |
| SOC 2 Type II | 2027 前半取得予定 |
| プライバシーマーク | 取得検討中（2027） |
| PCI DSS | 対象外（カード情報非取扱） |
| HIPAA | 対象外 |
| 電子帳簿保存法 | 対応済み（7 年保存、検索要件充足） |
| インボイス制度 | 対応済み（国税庁 API で `T + 13桁` 自動照合） |
| 源泉徴収 | 所得税法 第 204 条に基づき自動計算（10.21%） |

## J. サプライ チェーン

| 質問 | 回答 |
|---|---|
| 主要再委託先の所在 | Railway (米), Polygon (分散台帳), freee/QuickBooks/Xero（顧客接続時のみ） |
| 再委託先の監査 | Railway は SOC 2 Type II 取得済み、証明書のコピー提供可 |
| 再委託先変更の通知 | 30 日前に書面通知、甲が異議を申し立てた場合は代替手段を提案 |
| オープン ソース 利用 | 主要依存: Next.js, Hono, Drizzle, ethers.js, tweetnacl。ライセンス: MIT / Apache 2.0 のみ |
| OSS ライセンス コンプラ | `license-checker` を CI で実行、GPL 系は除外 |

## K. AI / LLM 固有項目（2025 年 以降 追加される質問）

| 質問 | 回答 |
|---|---|
| LLM への顧客データ学習 | **一切なし**。本サービスは LLM を含まない決済インフラ |
| プロンプト/出力の保存 | **保存しない**。本プラグインは LLM 出力を受信しないため該当なし |
| エージェント暴走対策 | Pay Token の `limitUsdc` と `expiresInSeconds` で経済的被害を上限設定 |
| モデル脆弱性（プロンプト インジェクション 等） | 本サービスには該当なし（決済 API のみ） |
| エージェント ID の追跡 | 各 Pay Token に `tokenId` を付与、全 charge を trace 可能 |

---

## 回答が見つからない質問に対する対応

上記で回答できない項目があった場合、以下のいずれかで対応します。

1. **1 営業日以内にメール回答**: contact@aievid.com に質問文を送付
2. **オンライン セキュリティ レビュー**: 30 分の Google Meet を無料で設定
3. **NDA 締結後の追加開示**: 本番構成図、侵入テスト結果、従業員リスト等

---

## 既存フォーマット別 対応インデックス

| 評価フォーマット | 参照セクション |
|---|---|
| Shared Assessments SIG-Lite | 全項目を A〜K に対応 |
| CSA CAIQ v4 | C (IAM), D (IVS), E (AIS), F (LOG), G (BCR), I (AAC) |
| 経産省 クラウド利用ガイドライン | A (業者選定), B (個情法), D (通信), F (ログ), G (BCP) |
| JASA-CSM (ISMS クラウド管理策) | I (認証), D (技術的対策), H (人的対策) |
| NIST CSF | Identify (A,J), Protect (C,D,E), Detect (F), Respond (F), Recover (G) |
| 金融 FISC 安全対策基準 | 追加質問に個別回答（contact@aievid.com） |

---

## 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-04-20 | 初版公開 |
