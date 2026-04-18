# Show HN & Product Hunt 投稿原稿

---

## 🟠 Show HN

### タイトル（複数案 / A/B）

**案 A（推奨・問題提起型）**
> Show HN: LemonCake – Give your AI agent a wallet with a kill switch

**案 B（機能名型）**
> Show HN: JWT-based Pay Tokens for autonomous AI agent payments (USDC)

**案 C（ユースケース型）**
> Show HN: A spending-limited wallet for Claude, Cursor, and Eliza agents

→ 「Give your AI agent a wallet with a kill switch」を最推奨。Kill switch という単語で HN コミュニティが反応する。

### 本文（400–500 語、HN の文化に合わせた「I built / here's why / here's how」構成）

```
Hi HN,

I'm the author of LemonCake (https://lemoncake.xyz), an infrastructure
layer that lets AI agents pay for API calls autonomously — with hard
spending limits and a one-click kill switch.

## The problem

LLM agents can plan, execute, and self-correct. But the moment they
need to call a paid API, a human has to step in with a credit card.
Every agent framework I've seen solves this with some variant of
"store the API key as an env var" — which is fine for a single
trusted developer, but a disaster for anything autonomous: no spending
cap, no per-task scoping, no audit trail, no way to stop a runaway
agent without rotating keys.

Stripe, PayPal, and every other payment rail was built around the
assumption that a human opens a checkout page. Agents need a
different primitive.

## What LemonCake does

The core primitive is the Pay Token: a signed JWT (Ed25519) that
encodes a spending limit, expiry, and a single allowed service. You
hand the token to your agent, and the agent uses it as a Bearer token
against our proxy:

    POST /api/proxy/<serviceId>/whatever
    Authorization: Bearer <pay_token>
    Idempotency-Key: <uuid>

The proxy verifies the token, charges per call in USDC, forwards the
request to the upstream API, and returns the response with
X-Charge-Id and X-Amount-Usdc headers. When the token's limit is
exhausted, the agent gets a structured 402 and stops cleanly.

## Design decisions worth discussing

- JWTs, not session tokens: the agent never talks to our auth service
  at runtime; proxy-side verification is a local Ed25519 check.
- Atomic revoke: `UPDATE tokens SET revoked=true WHERE id=? AND
  buyerId=? AND revoked=false` — one query handles the race between
  kill switch and in-flight charges.
- Idempotency-Key required: prevents double-charging on retries,
  which is catastrophic for micro-payments.
- Proxy model: upstream API keys never leave our server; agents only
  see Pay Tokens. Rotating an upstream key doesn't invalidate agent
  sessions.
- Sandbox mode: a flag on the token that skips USDC movement but
  keeps limit accounting live — you can dry-run an agent end-to-end
  without touching real money.

## What's live today

- Live demo + dashboard: https://lemoncake.xyz
- MCP server for Claude Desktop / Cursor:
  https://www.npmjs.com/package/lemon-cake-mcp
- Eliza v2 plugin:
  https://www.npmjs.com/package/eliza-plugin-lemoncake
- Source (MCP + Eliza plugin, OpenAPI spec):
  https://github.com/evidai/lemon-cake

Core payment engine is closed-source for now; everything an
integrator touches is open.

## What I'd love feedback on

- Is the 402-first error model the right choice, or should tokens
  degrade more gracefully?
- How would you want agent-to-agent sub-delegation to look?
  (Parent token spawns child token with lower limit?)
- Pay Token expiry: are 24h / 7d the right defaults, or should it
  always be task-scoped?

Happy to answer any questions. No PR-speak, just honest technical
discussion — this subreddit-adjacent cousin is where I learn the
most.
```

### 投稿の実務

- **火曜 8-10am PST** に投稿（SF のエンジニアがコーヒー飲む時間）
- タイトルに `Show HN:` を必ず入れる（そうじゃないと Show HN カテゴリに乗らない）
- 投稿直後は自分でコメントしない（HN コミュニティはセルフコメント嫌い）
- 1 つ目のコメントは作者が書いてもいい。上の「Design decisions」を深堀する形で
- フロントページ入りしたら 2 時間以内に来る技術質問に爆速で返す

### 懸念される質問 & 先回り回答

| 質問 | 回答 |
|---|---|
| 「なぜ Skyfire / Payman と違うのか？」 | Skyfire は BIN 共有モデル (Visa ベース)、LemonCake は USDC on-chain。手数料構造と決済速度で差別化 |
| 「USDC じゃなくて fiat 使いたい」 | Roadmap。現状は JPYC 入金で円建て資金管理可能 |
| 「JWT 署名鍵が漏れたら？」 | `jti` で revoke list 管理、鍵ローテーションで全トークン即時無効化可能 |
| 「Self-host できる？」 | 現状 managed のみ。OSS 化は roadmap に含む |
| 「$0.001/call のミクロ決済で on-chain 手数料ペイできる？」 | 内部で集約決済、on-chain は日次バッチ。個別 call は DB 記帳のみ |

---

## 🟡 Product Hunt

### タグライン（60 文字上限）

**案 A**: Give your AI agent a wallet, with a kill switch 🍋
**案 B**: JWT-based wallets for AI agents. Cap their spend, kill in 1 click.
**案 C**: The missing payment layer for autonomous AI agents

→ 案 A 推奨（絵文字は PH 文化に合う）

### 説明文（260 文字上限）

```
LemonCake lets AI agents pay for APIs autonomously — with hard
spending caps, a one-click kill switch, and sandbox mode for
risk-free testing. Works with Claude, Cursor, Eliza, or any agent
framework via REST. JWT Pay Tokens + USDC. Built for the agentic web.
```

### Maker コメント（最初のコメント / 必須）

```
Hey Product Hunt! 🍋

I built LemonCake because every time I tried to give an agent real
autonomy, I hit the same wall: "it needs to call a paid API, and
I don't trust it with my credit card."

So I built the thing I needed — a wallet primitive that's designed
for agents from the ground up.

Three things I'm proud of shipping today:

🔴 Kill Switch — revoke any agent's spending authority in one click.
   Atomic at the DB level, so there's no race with in-flight charges.

🟢 KYA (Know Your Agent) — tiered spend limits (10 → 1,000 →
   50,000 USDC/day). Register your agent, get your limit bumped
   instantly.

🟣 Sandbox Mode — test your agent end-to-end without moving real
   money. Limits still enforced, charges still logged, just zero
   USDC out.

Would love honest feedback — especially from other agent builders.
What would make this a no-brainer for your project?

Live demo: lemoncake.xyz
MCP package: npmjs.com/package/lemon-cake-mcp
Eliza plugin: npmjs.com/package/eliza-plugin-lemoncake
```

### Gallery / Media

必要な素材（優先順）:

1. **Hero GIF** (16:9, < 8MB)
   - Claude デスクトップ左半分、LemonCake ダッシュボード右半分
   - Claude が「Jina Reader で記事要約して」→ エージェントが課金 → 残高カウンターが減る
2. **Kill Switch GIF** — ダッシュボードから 1 クリックで token 停止 → 再度課金しようとして 422 エラー
3. **Sandbox GIF** — Sandbox トグル ON で発行 → 課金してもメイン残高不変
4. **アーキテクチャ図** — README にある ASCII をデザインし直したもの
5. **Integrations グリッド** — MCP / Eliza / REST の 3 カード

### Launch 当日運用

- **00:01 PST** にローンチ（火曜推奨）
- 最初の 30 分で Maker コメント + FAQ 3 つ自己投稿
- Hunter を事前に確保（PH で 500+ フォロワーの人）
- Twitter / Slack で「今日 PH に出してます」告知（過度な upvote 依頼は NG、PH が検知する）
- 終日 comment 返信に張り付く

### PH で避けるべきこと

- upvote 取引 / bot
- 「GIVEAWAY if we reach #1」系の煽り
- 他プロダクトを直接 disる（「X と違って」は OK、「X はクソ」は NG）

---

## 📊 同日ローンチ運用

HN と PH を **同じ火曜**にぶつけるのが定石:

- 04:00 UTC (00:01 PST) → Product Hunt
- 16:00 UTC (08:00 PST / 11:00 EST) → Show HN
- 17:00 UTC → X thread （日本語は翌朝 JST）
- 18:00 UTC → LinkedIn + Reddit (/r/LocalLLaMA, /r/AI_Agents)

同時リーチで「あちこちで見かけるプロダクト」印象を作る。
