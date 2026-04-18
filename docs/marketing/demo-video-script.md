# 🎬 デモ動画 カット割り台本

**目的**: X / Product Hunt / HN で使う 30 秒版 + 90 秒版のデモ動画
**ツール**: ScreenStudio / Descript（推奨）/ OBS + DaVinci Resolve
**解像度**: 1920x1080 (16:9) — X・PH・YT Shorts は縦 9:16 も別途書き出し

---

## 🔥 30 秒版（X フック用）

最初の 3 秒で「AI がお金動かしてる」と分からせる。**カウンター減少**が全て。

### 構成

| 時間 | 画面 | ナレ/テキスト | 音 |
|---|---|---|---|
| 0.0–2.0s | 黒背景 → 黄色テキスト 1 枚 | **"I gave an AI a $2 wallet."** (zoom-in) | キックドラム 1 発 |
| 2.0–4.0s | Claude Desktop に話しかける全画面 | ユーザー入力: *"search for 3 SaaS competitors to LemonCake"* | キータイプ音 |
| 4.0–8.0s | Split-screen: 左 Claude ツール実行中 / 右 ダッシュボード残高 | 右側に「🍋 LemonCake Balance」残高 **$2.000** がデカデカ表示 | 軽いベース |
| 8.0–13.0s | Split-screen キープ、3 回ツールコール走る | 残高が **$2.000 → $1.947 → $1.894 → $1.841** とリアルタイムで減る。左側で Claude が `call_service` を走らせる字幕 | カチッ、カチッ、カチッ (課金 SE) |
| 13.0–16.0s | ダッシュボード「Charges」タブにズーム | 最新 3 件の課金レコード: `$0.053 ✓`, `$0.053 ✓`, `$0.053 ✓` — 時刻と serviceId | タイプライター |
| 16.0–20.0s | Claude 側が長文回答を出力 | 回答テキストが tail-scroll で見える | 軽いピアノ |
| 20.0–23.0s | 赤枠で「🔴 KILL SWITCH」ボタンが光る。マウスがクリック | テキスト: **"Something weird? Kill it in one click."** | ガシャッ (停止 SE) |
| 23.0–26.0s | Claude が次のツールコールで失敗 → `422 Token revoked` 赤字 | テキスト: **"Agent stops. Instantly."** | ブザー |
| 26.0–30.0s | 黒背景 → ロゴ 🍋 + URL | **"lemoncake.xyz"** + **"Give your agent a wallet."** | フェードアウト |

### カット割りのコツ

- **0–3 秒で勝負**: 黄色背景 + 大文字 + wallet 絵文字で指が止まる
- **split-screen は 1 秒前に切り替え予告**: 画面真ん中に白い縦線が「スッ」と入って 2 分割化
- **残高カウンターは BIG**: 画面の 1/3 使って `$2.000 → $1.947` を mono フォントで
- **すべて無音声** or 字幕のみ。TL でミュート再生前提

---

## 🎯 90 秒版（Product Hunt / YouTube 用）

3 つの安全装置を全部見せる。ストーリーは「Wallet 渡す → 動く → 止める → Sandbox」。

### シーン構成

#### 🎬 Cold Open (0–5s)
```
[黒背景]
白テキスト: "Your AI agent can plan, code, and execute."
[0.5s 静止]
テキストが 1 行消えて: "But it still can't pay for anything."
[0.3s 静止]
赤ハイライト: "Until now."
[フェード]
```

#### 🎬 Act 1: Pay Token を発行 (5–25s)

| 秒数 | 画面 | ナレ/字幕 |
|---|---|---|
| 5–8s | ダッシュボードの Pay Tokens タブ、発行フォーム | 字幕: **"Step 1: Issue a Pay Token"** |
| 8–12s | Service ドロップダウンで `Jina Reader` 選択、Limit に `$2.00` 入力、「発行」クリック | 字幕: "Limit: $2 · Service: Jina Reader · Expires: 24h" |
| 12–15s | JWT が表示される、コピーボタン押下 | 字幕: **"A signed JWT. Scoped. Expiring. Revocable."** |
| 15–25s | Claude Desktop の設定で `LEMON_CAKE_PAY_TOKEN` にペースト、再起動 | 字幕: **"Hand it to the agent. That's it."** |

#### 🎬 Act 2: エージェントが勝手に動く (25–50s)

| 秒数 | 画面 | ナレ/字幕 |
|---|---|---|
| 25–30s | Claude に入力: *"Research the top 3 SaaS competitors for an M2M payment infra company."* | 字幕: (ユーザー入力表示) |
| 30–40s | Split-screen 開始。左: Claude が `call_service` を 3 連発。右: ダッシュボードの Charges が 3 行追加、残高が減少 | 字幕: **"3 API calls. 3 charges. Zero human input."** |
| 40–45s | Claude が長文回答を出力 | 字幕: **"Total: $0.159 spent in 8 seconds."** |
| 45–50s | ダッシュボードの Charges タブにズーム、全履歴表示 | 字幕: "Every call logged. Every cent accounted for." |

#### 🎬 Act 3: Kill Switch (50–65s)

| 秒数 | 画面 | ナレ/字幕 |
|---|---|---|
| 50–53s | Pay Tokens タブに戻る、アクティブトークンが 1 つ | 字幕: **"Something off?"** |
| 53–57s | 赤い「🔴 無効化」ボタンをホバー → クリック → 確認ダイアログで OK | 字幕: **"One click."** |
| 57–62s | Claude に再度ツール使わせる → 赤字で `422 Token has been revoked` | 字幕: **"Agent stops. Cannot charge. Cannot retry."** |
| 62–65s | ダッシュボードのトークン行に赤「REVOKED」バッジ | 字幕: "Atomic. Race-free. Irreversible." |

#### 🎬 Act 4: Sandbox モード (65–80s)

| 秒数 | 画面 | ナレ/字幕 |
|---|---|---|
| 65–68s | 発行フォームに戻る。紫のトグル「Sandbox Mode」ON | 字幕: **"Want to test first? Sandbox mode."** |
| 68–74s | Sandbox トークンで 10 回課金 → 紫 TEST バッジが付いた行が増える、メイン残高カード **不動** | 字幕: **"Full flow. No real USDC moved."** |
| 74–80s | ダッシュボードの "USDC Balance" カードを赤枠で囲み、数字が一切変わってないことを見せる | 字幕: **"Dry-run your agent. Ship with confidence."** |

#### 🎬 Closing (80–90s)
```
[背景: Philosophy セクションの DVD screensaver 動画]
白大文字: "Give your agent a wallet."
[0.5s 間]
黄色: "LemonCake 🍋"
[0.3s 間]
小さめ: "lemoncake.xyz"
[ロゴフェード]

CTA バー (下部):
    npx lemon-cake-mcp    ·    npm i eliza-plugin-lemoncake
```

---

## 🛠 撮影・編集の実務

### 環境セットアップ
- **Chrome を新規プロファイルで起動**（ブックマーク・通知が映らないよう）
- macOS メニューバーは自動非表示に
- Claude Desktop のウィンドウは 1280x800、ダッシュボードは 1280x800 でサイドバイサイド
- ダッシュボードは **ライトモード固定**（黒い Claude と対比させる）
- 課金デモ用に **サンドボックストークンじゃなく実 USDC 残高 $2.000 ちょうど** を仕込む（桁が綺麗）

### 撮影
- **ScreenStudio** or **Rec** でシネマティック録画
- マウスカーソルは拡大設定（見やすさ優先）
- 1.2x でゆっくり動かす（API レスポンス待ちでも視聴者は退屈しない）

### 編集
- **DaVinci Resolve** で無料 OK
- カット: ジャンプカット多用（「あっ、見入っちゃった」を作る）
- テキスト: Inter Black / SF Pro Display Heavy（Claude Artifacts 的）
- BGM: Epidemic Sound の「Deep Focus」「Tech House」系。X は BGM なしでも可
- 字幕: SubMagic / Captions.ai で自動生成 → 手動微修正

### 書き出し
- **横**: 1920x1080, H.264, CRF 18, < 100MB
- **縦 (Shorts/Reels)**: 1080x1920, 同上
- **GIF** (README 用): 1200x750, 8MB 以下, ffmpeg:
  ```bash
  ffmpeg -i demo.mp4 -vf "fps=15,scale=1200:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 demo.gif
  ```

### チェックリスト
- [ ] 最初の 3 秒で「財布」「$」「残高減少」が見える
- [ ] 音声なしでもストーリーが追える
- [ ] 実際のトークン / メールアドレスが映り込んでない
- [ ] 課金額・残高の数字が途中で矛盾してない
- [ ] CTA（URL）が最後に 2 秒以上映る
- [ ] 縦版も書き出した

---

## 💡 派生コンテンツ

この撮影素材から 6 本作れる:

1. **30s 横動画** — X メイン
2. **30s 縦動画** — Shorts / Reels / TikTok
3. **90s 横動画** — Product Hunt / YouTube
4. **10s クリップ × 3** (Kill Switch / Sandbox / $ 減少) — 個別リプライ用
5. **README 用 GIF** (20 秒, ダイジェスト版)
6. **スクショ 4 枚** — OGP / PH gallery
