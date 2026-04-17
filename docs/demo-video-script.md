# 🎬 LemonCake デモ動画 台本

**尺**: 約40秒  
**形式**: Claude Desktop の画面録画 + テロップ後付け  
**ゴール**: 「AIが自分でAPIを選んで、USDCで支払いまで完結した」瞬間を見せる

---

## 事前準備チェックリスト

### 1. claude_desktop_config.json を設定

```json
{
  "mcpServers": {
    "lemon-cake": {
      "command": "npx",
      "args": ["-y", "lemon-cake-mcp"],
      "env": {
        "LEMON_CAKE_PAY_TOKEN": "<ダッシュボードで発行したPay Token>",
        "LEMON_CAKE_BUYER_JWT": "<ダッシュボードのSettingsからコピー>"
      }
    }
  }
}
```

ファイルの場所:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`

### 2. Claude Desktop を再起動

設定反映のため必ず再起動。左下に「lemon-cake」ツールアイコンが出れば接続済み。

### 3. 新しいチャットを開く

チャット履歴のない真っ新な状態から録画開始すると映える。

---

## 録画手順

**録画ツール**: QuickTime Player →「新規画面収録」  
**推奨**: Claude Desktop のウィンドウだけをトリミング録画（画面全体は映さない）

---

## シーン構成・打ち込むプロンプト

### Scene 1（0〜3秒）: 静止画

何も打たずに Claude Desktop の初期画面を映す。  
**後付けテロップ**: 「AIエージェントに財布を持たせた」

---

### Scene 2（3〜12秒）: サービス一覧を取得

**入力するプロンプト（そのままコピーして打つ）:**

```
LemonCakeのマーケットプレイスにどんな有料APIがある？
```

**期待されるClaudeの動作:**
- `list_services` ツールを自動で呼び出す
- 4つのサービス（Agent Search API / LLM Proxy Gateway / Document Parser API / Agent Memory MCP）が価格付きで一覧表示される

**後付けテロップ**: 「AIがAPIマーケットプレイスを自律的に検索」

---

### Scene 3（12〜28秒）: 支払いの実行 ⭐ メインシーン

**入力するプロンプト:**

```
Agent Search APIを使って「AI agent payment」で検索して。0.001 USDCまで使っていいよ。
```

**期待されるClaudeの動作:**
- `call_service` ツールを呼び出す
- serviceId: `demo_agent_search_api`、limitUsdc: `0.001`
- レスポンスに `chargeId` と `amountUsdc` が返ってくる
- Claudeが「chargeId: ch_xxxxx / 0.0001 USDC 課金されました」と報告

**後付けテロップ**: 「自律的に支払い完了 / Charge ID 発行 / 二重課金なし」

---

### Scene 4（28〜36秒）: 残高確認

**入力するプロンプト:**

```
今のUSDC残高を確認して
```

**期待されるClaudeの動作:**
- `check_balance` ツールを呼び出す
- 残高・KYCティアが表示される

**後付けテロップ**: 「リアルタイムで残高管理」

---

### Scene 5（36〜40秒）: エンドカード（静止画）

録画を止めて、別途 LemonCake のロゴ＋URLのカードを作成して差し込む。

```
🍋 LemonCake
Give your AI agent a wallet.
lemoncake.xyz
```

---

## テロップ文案（X/Twitter 投稿用）

```
AIエージェントに財布を持たせた

① マーケットプレイスでAPIを自律選択
② Pay TokenでUSDC決済を実行
③ 予算超過で自動停止

npx lemon-cake-mcp で今すぐ試せる

#AIAgent #MCP #Claude #Web3
lemoncake.xyz
```

---

## うまくいかないときのチェック

| 症状 | 原因 | 対処 |
|---|---|---|
| lemon-cake ツールが出ない | config.json の場所・書式ミス | JSON の構文を確認 / Claude 再起動 |
| `call_service` でエラー | PAY_TOKEN が未設定 or 期限切れ | ダッシュボードで新しいPay Tokenを発行 |
| `check_balance` でエラー | BUYER_JWT が未設定 | ダッシュボードのSettingsから再コピー |
| 402 が返ってくる | Pay Tokenの上限に達した | 上限を上げて新しいTokenを発行 |
