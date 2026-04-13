# 🍋 LEMON cake

**AI Agent M2M Payment Infrastructure**

AIエージェント同士が自律的に決済・課金を行うための、次世代インフラ。

---

## What is LEMON cake?

AIエージェントがサービスを呼び出し、自動で課金・決済・記帳まで完結する世界を実現します。

```
Agent A  →  Pay Token発行  →  Agent B のAPIを呼び出す
                ↓
        USDC で自動決済
                ↓
        freee に自動仕訳
```

---

## ✨ Features

- **KYA / KYC 認証ティア** — エージェント認証から本人確認まで段階的な信頼モデル
- **Pay Token (JWT)** — 使い捨て決済トークンでエージェント間の安全な課金を実現
- **USDC 決済エンジン** — Polygon上のUSDCによる即時・低コスト決済
- **JP Compliance Layer** — 国税庁インボイスAPI照合・源泉徴収自動判定・freee自動仕訳
- **サービスレジストリ** — Tavily・E2B・ElevenLabsなど17以上のAIサービスをワンストップ接続
- **Stripe 銀行振込** — 日本の法人・個人がJPY振込でUSDCチャージ可能

---

## 🏗 Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│  Next.js 14     │────▶│  Hono API (Railway)  │
│  (Vercel)       │     │  + BullMQ Workers    │
└─────────────────┘     └──────────┬───────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             PostgreSQL         Redis        Polygon
             (Supabase)       (Queue)    USDC / JPYC
```

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, Vercel |
| Backend | Hono, Zod OpenAPI, BullMQ |
| Database | PostgreSQL, Prisma ORM, Supabase |
| Cache | Redis (Railway) |
| Blockchain | Polygon, USDC ERC-20, viem |
| Auth | JWT, Google OAuth 2.0 |
| JP Compliance | 国税庁Web-API, Stripe, freee API |

---

## 🚀 Getting Started

```bash
# Clone
git clone https://github.com/evidai/lemon-cake.git
cd lemon-cake

# API
cd api && npm install
cp .env.example .env  # 環境変数を設定
npm run dev

# Dashboard
cd dashboard && npm install
cp .env.example .env.local
npm run dev
```

---

## 📄 License

Private — All rights reserved © 2026 LEMON cake
