# Dify Marketplace 提出手順

`integrations/dify/dist/lemoncake-0.0.1.difypkg` を `langgenius/dify-plugins` に PR 提出するための完全手順です。

## 前提

- GitHub アカウント: `evidai`
- 提出先: <https://github.com/langgenius/dify-plugins>
- 提出 path: `lemoncake/lemoncake/lemoncake-0.0.1.difypkg`
- 必要: `gh` CLI か Web UI

---

## 方法 A — `gh` CLI で自動化（推奨）

```bash
# 1) gh をまだ入れていなければ
brew install gh
gh auth login

# 2) ビルド済み .difypkg を確認
ls -lh /Users/workoutsomehow/adhunt-pro/integrations/dify/dist/lemoncake-0.0.1.difypkg

# 3) 再ビルド（マニフェストを更新したとき）
cd /Users/workoutsomehow/adhunt-pro/integrations/dify/lemoncake
rm -f ../dist/lemoncake-0.0.1.difypkg
zip -r ../dist/lemoncake-0.0.1.difypkg . \
  -x "*.pyc" -x "__pycache__/*" -x ".DS_Store" -x "*.difypkg"

# 4) dify-plugins を fork & clone
cd /tmp
gh repo fork langgenius/dify-plugins --clone=true --remote=true
cd dify-plugins

# 5) ブランチ作成
git checkout -b feat/lemoncake-0.0.1

# 6) 提出パス作成 & コピー
mkdir -p lemoncake/lemoncake
cp /Users/workoutsomehow/adhunt-pro/integrations/dify/dist/lemoncake-0.0.1.difypkg \
   lemoncake/lemoncake/

# 7) コミット
git add lemoncake/lemoncake/lemoncake-0.0.1.difypkg
git commit -m "feat(lemoncake): add lemoncake plugin 0.0.1"
git push -u origin feat/lemoncake-0.0.1

# 8) PR 作成（本文は integrations/dify/PR_BODY.md を使う）
gh pr create \
  --repo langgenius/dify-plugins \
  --title "feat(lemoncake): add LemonCake plugin 0.0.1" \
  --body-file /Users/workoutsomehow/adhunt-pro/integrations/dify/PR_BODY.md
```

---

## 方法 B — GitHub Web UI のみ

1. <https://github.com/langgenius/dify-plugins> を開いて右上 **Fork**
2. 自分の fork で **Add file → Upload files**
3. パス `lemoncake/lemoncake/` に `.difypkg` をアップロード
   - (Web UI で深いパスを作るには、`Add file → Create new file` で `lemoncake/lemoncake/README.md` を一度作って空コミットしてから、Upload)
4. "Propose changes" → ブランチ名 `feat/lemoncake-0.0.1` → Commit
5. fork の画面から **Contribute → Open pull request**
6. タイトル: `feat(lemoncake): add LemonCake plugin 0.0.1`
7. 本文: `integrations/dify/PR_BODY.md` の内容をコピペ
8. Create pull request

---

## PR レビュー後の修正フロー

レビュワーが PR に指摘コメントしてきた場合:

```bash
# 修正を lemon-cake repo で行う
cd /Users/workoutsomehow/adhunt-pro/integrations/dify/lemoncake
vim manifest.yaml   # 版数を 0.0.2 に上げる等

# 再ビルド
rm -f ../dist/lemoncake-*.difypkg
zip -r ../dist/lemoncake-0.0.2.difypkg . \
  -x "*.pyc" -x "__pycache__/*" -x ".DS_Store" -x "*.difypkg"

# dify-plugins 側で差し替え
cd /tmp/dify-plugins
git checkout feat/lemoncake-0.0.1
rm lemoncake/lemoncake/lemoncake-0.0.1.difypkg
cp /Users/workoutsomehow/adhunt-pro/integrations/dify/dist/lemoncake-0.0.2.difypkg \
   lemoncake/lemoncake/
git add -A
git commit -m "fix(lemoncake): bump to 0.0.2 per review feedback"
git push
```

> **重要:** 1 PR = 1 新 `.difypkg`。既存のものを削除して新版数を追加するのが Dify の流儀。

---

## 審査スケジュールの見込み

- PR 提出後、**1 週間以内**に初回レビューが開始されるのが通例
- 典型的な指摘項目:
  - Privacy Policy URL が到達不能
  - manifest.yaml の必須フィールド欠落
  - アイコンが SVG/PNG じゃない、サイズ規定外
  - README に contact info / repo URL が無い
- マージ後、Dify Marketplace に反映されるまで更に 1〜3 日

---

## チェックリスト（提出前）

- [ ] `manifest.yaml` の `version` と `.difypkg` のファイル名が一致
- [ ] `README.md` に contact info (`contact@aievid.com`) と repo URL
- [ ] `PRIVACY.md` の内容と <https://lemoncake.xyz/legal/dify-plugin> が一致
- [ ] `api.lemoncake.xyz` にアクセス可能（本番デプロイ済み）
- [ ] プラグインをローカル Dify で動作確認（manifest 読み込み + issue_pay_token 1 回）
