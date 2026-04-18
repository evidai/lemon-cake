# X (Twitter) Thread — LemonCake Launch

2 バージョン用意しています。どちらも **最初のツイートに動画（split-screen デモ、30 秒）を添付** する想定。
X の 1 ツイート = 280 文字 (英語) / 140 文字 (日本語換算) だが、プレミアムで長文可能なので「短い版」と「長文版」両方を示す。

---

## 🇯🇵 日本語版（バイラル狙い / フック型）

### ツイート 1 — フック + デモ動画
```
AIに「財布」を渡してみた。

上限 $2、有効期限 24h、使えるのは 1 つの API だけ。

渡した瞬間、Claude が勝手に API 叩き始めた。
リアルタイムで残高が減っていく。

ほしい人: lemoncake.xyz 🍋
[動画添付]
```

### ツイート 2 — なぜ作ったか
```
エージェントが自律的に動くようになったのに、
「お金を払う」だけ人間の承認が必要なの、
変じゃないですか？

Stripe は "人間が決済画面を開く" 前提で作られてる。
エージェントには別の決済インフラが必要です。
```

### ツイート 3 — 仕組み
```
LemonCake の中身はシンプル：

1. JWT で Pay Token を発行（上限・期限・対象 API 付き）
2. エージェントは Bearer でそれを渡すだけ
3. プロキシが課金して API に転送
4. 上限到達で自動停止 (402)

Stripe でいう "サブスク" ではなく、"プリペイドカード" の発想。
```

### ツイート 4 — Kill Switch
```
で、一番重要なのは「止められること」。

エージェントが暴走した瞬間、
ダッシュボードから 1 クリックで即停止。
以降の課金リクエストは 422 で拒否されます。

AI に財布を渡す覚悟は、止める手段とセットです。
[Kill Switch スクショ]
```

### ツイート 5 — 接続方法
```
Claude Desktop / Cursor なら npm 1 発：

  npx lemon-cake-mcp

Eliza v2 なら character.plugins に追加するだけ：

  plugins: [lemonCakePlugin]

どのエージェントフレームワークでも、
REST API なら直接叩けます。
```

### ツイート 6 — CTA
```
Sandbox モードもあるので実 USDC を使わずテスト可能。

- デモ: lemoncake.xyz
- MCP: npmjs.com/package/lemon-cake-mcp
- Eliza: npmjs.com/package/eliza-plugin-lemoncake
- GitHub: github.com/evidai/lemon-cake

感想・質問・こういうのほしい、何でも reply ください 🙏
```

---

## 🇬🇧 English version (Show-HN friendly / credibility tone)

### Tweet 1 — Hook + demo video
```
I gave an AI agent a $2 wallet.

It started buying API calls on its own 30 seconds later.

Pay Tokens = JWT-based spend authorization for M2M payments.
Kill switch baked in. Sandbox mode for testing.

→ lemoncake.xyz 🍋
[video attached]
```

### Tweet 2 — The problem
```
LLM agents can read, write, plan, and call tools.

But they still can't pay for anything autonomously —
every paid API requires a human in the loop for the card.

Stripe was built for humans with browsers.
Agents need something else.
```

### Tweet 3 — The primitive
```
The primitive we built: the Pay Token.

A signed JWT that encodes:
- limit (USD)
- expiry
- allowed service
- buyer identity

Hand it to the agent. That's it. It can now pay,
within those constraints, without ever seeing your card.
```

### Tweet 4 — Safety
```
Three safety layers, all shipping today:

🔴 Kill Switch — revoke any token in one click
🟢 KYA tiers — 10 → 1,000 → 50,000 USDC/day
🟣 Sandbox — test without moving real USDC

Atomic revoke, race-condition-free.
If something goes wrong, you stop it instantly.
```

### Tweet 5 — Integrations
```
Three ways to connect your agent:

• Claude Desktop / Cursor → `npx lemon-cake-mcp`
• Eliza v2 → `plugins: [lemonCakePlugin]`
• Anything else → REST API (POST /api/proxy/:serviceId/*)

npm packages published. Source on GitHub.
```

### Tweet 6 — CTA
```
Try it:

→ Live demo: lemoncake.xyz
→ MCP: npmjs.com/package/lemon-cake-mcp
→ Eliza: npmjs.com/package/eliza-plugin-lemoncake
→ Code: github.com/evidai/lemon-cake

Would love honest feedback. Building in public.
RT appreciated.
```

---

## ⚡️ 投稿運用メモ

### タイミング
- **英語**: 火曜/水曜/木曜 9-11am ET（米国エンジニアのランチ前）
- **日本語**: 火曜/水曜/木曜 21-23 時 JST（寝る前のタイムライン）

### 絡みに行くアカウント（日本語）
- @shi3z, @karaage0703, @yutakikuchi_, @yuiseki_, @mizchi, @catnose99, @hi_saito

### 絡みに行くアカウント（英語）
- @swyx, @alexalbert__, @shaoruu, @rauchg, @dzhng, @danshipper
- AI agent 系: @karpathy, @anthrupad, @elizaOS, @fxtwitter_hq

### 引用 RT 戦略
- Anthropic / OpenAI / Eliza の agent 系ポストに「We built this for exactly this case 🍋」で引用 RT
- 「AI エージェント決済できない問題」をボヤいてる人を検索で探して丁寧にリプ

### NG
- 宣伝臭強めのハッシュタグ多用（`#AI #Web3 #Payments` 3 個以上）
- 1 日 3 ポスト以上のセルフプロモ（シャドウバン対象）
- 「バズれ！」系の煽り画像

### 一番重要
**動画のクオリティ** > 文章。最初の 3 秒で「残高が減るカウンター」が見えるかが生命線。
