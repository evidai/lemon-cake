# LemonCake for Dify 🍋

Dify のエージェントに「財布」を渡すためのプラグイン。上限付き Pay Token の発行・残高確認・即時 Kill Switch・課金履歴取得を Dify ワークフローから直接呼び出せます。

会計 freee への自動仕訳連携、国税庁 API を使った適格請求書（インボイス）照合、源泉徴収 10.21% の自動控除も LemonCake 本体側で完結します。

- **サイト:** https://lemoncake.xyz
- **リポジトリ:** https://github.com/evidai/lemon-cake
- **連絡先:** contact@aievid.com
- **プライバシーポリシー:** [`PRIVACY.md`](./PRIVACY.md) / https://lemoncake.xyz/legal/dify-plugin

---

## 使えるツール（4本）

| ツール名 | 呼び出し先 | 用途 |
|---|---|---|
| `Pay Token を発行` | `POST /api/tokens` | 上限・有効期限付き JWT を発行。エージェントはこれを Bearer で渡すだけで課金可能 |
| `残高を確認` | `GET /api/auth/me` | USDC 残高と KYA 日次上限を取得 |
| `Pay Token を停止 (Kill Switch)` | `PATCH /api/tokens/{id}/revoke` | 即時・原子的にトークンを無効化。暴走時の最後の砦 |
| `課金履歴を取得` | `GET /api/charges` | 直近の課金をリスト化。経費精算・要約に |

Dify のプロキシを経由するため、通信ログ・監査ログはすべて **Dify 側に自動で残ります**。情シスの稟議を通しやすい設計です。

---

## 🚀 3分で始める

プラグイン利用には LemonCake アカウントと USDC 残高が必要です。

1. **[無料アカウント作成](https://lemoncake.xyz/register?utm_source=dify-plugin&utm_medium=marketplace-readme&utm_campaign=onboard)** — メール1つで完了
2. **[USDC 残高をチャージ](https://lemoncake.xyz/dashboard/billing?utm_source=dify-plugin&utm_medium=marketplace-readme&utm_campaign=topup)** — 最低 $5、JPYC 対応
3. **Buyer JWT をコピー** — [Dashboard → Settings → API](https://lemoncake.xyz/dashboard?utm_source=dify-plugin&utm_medium=marketplace-readme) から
4. Dify に下記のとおりインストールして貼り付け

> 📚 [クイックスタート ドキュメント](https://lemoncake.xyz/docs/quickstart?utm_source=dify-plugin&utm_medium=marketplace-readme)

---

## インストール手順

### Step 1. プラグインの追加

Dify のダッシュボードから:

```
Plugins → Marketplace → 「LemonCake」 を検索 → Install
```

### Step 2. Buyer JWT の設定

1. [lemoncake.xyz](https://lemoncake.xyz) にログイン
2. **ダッシュボード → 設定 → API** で Buyer JWT を発行してコピー
3. Dify のプラグイン設定に貼り付けて **Save**
4. プラグインが `GET /api/auth/me` に対してトークンの有効性を検証 → 成功すれば利用可能

### Step 3. ワークフローで使う

Dify のワークフロー/エージェントノードの "Tools" からこの4つが選べるようになります。

---

## 典型的な使い方

```
ユーザー: 「この3記事を要約して」
 └─ LLM がタスクを分解
      └─ Tool: Pay Token 発行 (service_id="jina-reader", limit_usdc=2, expires_in_seconds=600)
           └─ Tool: jina-reader プラグイン  ← 発行した Pay Token を Bearer で使用
                └─ Tool: 課金履歴を取得 (limit=5)
                     └─ LLM: 「3件読みました。費用は 0.045 USDC です」
```

---

## セキュリティ・監査

- Buyer JWT は Dify の暗号化クレデンシャル ストアに保存されます（他のツールのシークレットと同等）
- 本プラグインが LemonCake 以外の外部に送信するデータはありません（`api.lemoncake.xyz` への通信のみ）
- **情報システム部門向け監査キット**: リポジトリの [`/docs/dify/audit-kit/`](../../../docs/dify/audit-kit/) に以下を同梱:
  - データフロー図
  - セキュリティ ホワイトペーパー
  - ログ保存・削除ポリシー
  - コンプライアンス取得状況
  - インシデント対応手順

---

## よくある質問

**Q. Buyer JWT が漏れたら？**
A. LemonCake ダッシュボードから該当 JWT を即時 revoke 可能です（監査ログに残ります）。

**Q. 本番 USDC を動かさずに試せる？**
A. `issue_pay_token` の `sandbox: true` で発行すれば、実 USDC は動かず上限管理だけ本番同様に動きます。

**Q. freee 連携はこのプラグインでやる？**
A. いいえ、LemonCake 本体で自動的に仕訳登録します。このプラグインは発行と停止の窓口だけを提供します。

**Q. セルフホストできる？**
A. このプラグインは `api_base_url` を自由に変更できるので、LemonCake API を自前で建てる場合も同じ manifest で動きます。

---

## ライセンス

MIT。プラグイン自体は自由に fork・セルフホストして構いません。LemonCake マネージド サービス側の利用規約は [lemoncake.xyz/legal](https://lemoncake.xyz/legal) を参照してください。
