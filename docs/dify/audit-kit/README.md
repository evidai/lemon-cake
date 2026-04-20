# LemonCake for Dify — 情シス 監査キット 🔒

LemonCake の Dify プラグインを企業導入するときに **情報システム部門 / 情報セキュリティ部門 / DX 推進部門** が稟議書にそのまま添付できる資料一式です。

> **用途:** 導入時の外部 API 連携審査・データ主権審査・ログ保存審査・インシデント対応審査を 1 パスで通すための「監査キット」。PDF 化して稟議資料に差し込むか、そのままコピペしてセキュリティ チェックリストに回答してください。

---

## 📄 同梱ドキュメント

| # | ファイル | 想定読者 | 内容 |
|---|---|---|---|
| 01 | [data-flow.md](./01-data-flow.md) | 情シス / セキュリティ | エージェント ⇄ Dify ⇄ LemonCake ⇄ 外部サービスのデータフロー全景と、各区間で送受される情報 |
| 02 | [security-whitepaper.md](./02-security-whitepaper.md) | 情報セキュリティ | 認証（JWT Ed25519）、データ暗号化、Kill Switch の原子性、脅威モデル |
| 03 | [log-retention-policy.md](./03-log-retention-policy.md) | 情シス / 法務 | ログ種別・保存期間・削除要件・GDPR / 個人情報保護法 対応 |
| 04 | [compliance-status.md](./04-compliance-status.md) | 法務 / 監査 | SOC 2 / ISMS / PrivacyMark / GDPR の取得状況とロードマップ |
| 05 | [incident-response.md](./05-incident-response.md) | 情シス / BCP | 重大インシデント時の連絡体制、SLA、鍵漏えい時の対応手順 |
| 06 | [self-assessment-checklist.md](./06-self-assessment-checklist.md) | 情シス（稟議起案者） | 60 項目セルフ チェックリスト。稟議書にそのまま添付可能、ベンダー問合せ不要 |
| 07 | [dpa-template.md](./07-dpa-template.md) | 法務 | 記入・押印だけで締結可能な データ処理契約書（DPA）テンプレ |
| 08 | [security-questionnaire-answers.md](./08-security-questionnaire-answers.md) | 情シス / 情報セキュリティ | SIG-Lite / CAIQ / 経産省ガイドライン 等の代表的アンケートへのコピペ可能な回答集 |

---

## 🎯 「自分たちで責任を取れる」 ための 3 点セット

情シス / 法務が **ベンダー問合せゼロで** 社内決裁を通すための 3 点セットです。

1. **[06 セルフ チェックリスト](./06-self-assessment-checklist.md)** ― 60 項目に事前回答済み。稟議書に貼るだけ
2. **[07 DPA テンプレ](./07-dpa-template.md)** ― 乙欄記入済み。甲欄に押印すれば実効的な合意書
3. **[08 アンケート 回答集](./08-security-questionnaire-answers.md)** ― 貴社独自のベンダー評価フォームに貼り付け可能

---

## 🧾 追加で渡せる資料

- **OpenAPI 仕様書**（完全版）: https://api.lemoncake.xyz/openapi.json
- **プラグイン ソース コード**（全公開）: https://github.com/evidai/lemon-cake/tree/main/integrations/dify/lemoncake
- **プライバシー ポリシー**: https://lemoncake.xyz/legal/dify-plugin

---

## ✅ 稟議書テンプレ（そのままコピペ可）

> ### 外部 API 連携審査 ― LemonCake (Dify プラグイン)
>
> - **送信先:** `https://api.lemoncake.xyz`
> - **送信データ:** Pay Token 発行パラメータ（サービスID・上限額・有効期限）/ トークンID / 取得件数のみ。**会話内容や添付ファイルは一切送信しません**（詳細: [01-data-flow.md](./01-data-flow.md)）
> - **認証方式:** Buyer JWT（Ed25519 署名）、Dify 暗号化クレデンシャル ストアに保管
> - **ログ保存:** Dify プロキシ経由のため監査ログは自動記録、LemonCake 側は 30 日ローリング（詳細: [03-log-retention-policy.md](./03-log-retention-policy.md)）
> - **インシデント対応:** 24時間以内初動、契約主体: 合同会社〇〇（LemonCake 運営）、連絡先: contact@aievid.com（詳細: [05-incident-response.md](./05-incident-response.md)）
> - **暴走防止:** ダッシュボード + `revoke_token` ツールから **1 クリックで即時停止**、原子的更新で in-flight の課金もブロック
> - **ソース公開:** プラグイン側 MIT / API 側も一部 OSS（[GitHub](https://github.com/evidai/lemon-cake)）

---

## 📞 質問・追加資料請求

- 技術質問: https://github.com/evidai/lemon-cake/issues
- 稟議資料の個別対応: contact@aievid.com
- 対面/オンラインでのセキュリティ レビュー: ご相談ください（無料）
