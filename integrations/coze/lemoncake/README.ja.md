# LemonCake for Coze（扣子）

[Coze](https://www.coze.com) / [扣子](https://www.coze.cn) のボットに **上限付き USDC ウォレット** と **ワンクリック Kill Switch** と **freee/QuickBooks 自動仕訳** を付与するプラグインです。

- **認証:** Buyer JWT（Bearer、HMAC-SHA256 署名）
- **API ベース:** `https://api.lemoncake.xyz`
- **ツール:** `issue_pay_token` / `check_balance` / `revoke_token` / `list_charges`
- **ソース:** https://github.com/evidai/lemon-cake
- **プライバシーポリシー:** https://lemoncake.xyz/legal/dify-plugin

## Dify 版との違い

Coze は **OpenAPI をそのまま叩くシン クライアント方式** です。`.difypkg` のような成果物は存在せず、ホスト型 Python ランタイムもありません。公開も GitHub PR ではなく Coze 公式 Web UI から行います。

このため本ディレクトリは **Coze 管理 UI に貼り付ける素材** を Git 管理しています：

| ファイル | 役割 |
|---|---|
| `manifest.json` | Coze プラグイン マニフェスト（メタ情報 + 認証 + tool index） |
| `openapi.yaml`  | 4 エンドポイントの OpenAPI 3.1 スペック |
| `SUBMIT.md`     | Coze Plugin Store 提出手順 |

## 利用者向け クイック スタート

1. Coze ボット エディター → **プラグイン** → **プラグインを追加** → "LemonCake" を検索（公開後）。インストール → Buyer JWT を貼り付け。
2. 公開前の検証として使う場合: **プラグインを作成** → **OpenAPI からインポート** → `openapi.yaml` をアップロード → Bearer トークン認証を選択 → Buyer JWT を貼り付け → テスト → ボットに追加。

詳細な公開手順は `SUBMIT.md` を参照してください。
