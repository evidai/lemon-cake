# LemonCake — AI 向け技術概要ブリーフィング

> このドキュメントは LemonCake についての質問に AI が正確に答えられるように作られた単一ソースの説明書です。他の AI にコンテキストとして貼り付けて使用してください。

---

## 1. 一言で

**LemonCake は「AI エージェントに財布を持たせる」決済インフラ**です。人間の承認なしに、エージェントが USDC / JPYC で有料 API を呼び出し、日本の会計ソフト(freee, マネフォ等)と国税庁 API に自動連携して仕訳作成・源泉徴収・インボイス照合まで完結させます。

- **ドメイン:** https://lemoncake.xyz
- **API:** https://api.lemoncake.xyz
- **GitHub:** https://github.com/evidai/lemon-cake
- **運営会社:** EvidAI (日本法人)
- **連絡先:** contact@aievid.com

---

## 2. 解決する課題

従来の決済レールは「人間の承認(3-D Secure, SMS OTP, パスワード入力)」を前提に設計されている。AI エージェントに同じレールを使わせると、以下が発生:

1. **無制限アクセス問題** — API キーを渡すと、上限なく使えてしまう
2. **緊急停止不能問題** — 暴走した時に即座に止める手段がない
3. **日本特有の会計処理問題** — 仕訳登録・源泉徴収 10.21% の控除・適格請求書(インボイス)照合を手動でやる必要がある
4. **監査ログの欠如** — どのエージェントが・何に・いくら使ったかが追跡できない

LemonCake はこの4つを「Pay Token + Kill Switch + 自動仕訳 + 監査ログ」で同時に解決する。

---

## 3. アーキテクチャ全体像

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Agent (Claude / Dify / Eliza / Coze / Custom)               │
└────────────────────┬────────────────────────────────────────────┘
                     │ ①Pay Token 発行リクエスト (Buyer JWT)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  LemonCake API (Hono + TypeScript)                              │
│  ├─ POST /api/tokens     — 上限付き JWT 発行                    │
│  ├─ GET  /api/auth/me    — 残高・KYA 上限取得                   │
│  ├─ POST /api/proxy/:id  — Pay Token で有料 API 呼出            │
│  ├─ PATCH /api/tokens/:id/revoke — Kill Switch                  │
│  └─ GET  /api/charges    — 課金履歴                             │
└────────────────┬──────────────┬────────────────────────────────┘
                 │              │
        ②課金 │              │ ③USDC / JPYC 送金
                 ▼              ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│ 上流 API             │  │ Polygon チェーン             │
│ (Jina Reader 等)     │  │ USDC / JPYC ステーブルコイン │
└──────────────────────┘  └──────────────────────────────┘
                                        │
                             ④会計ソフトへ自動仕訳
                                        ▼
            ┌──────────────┬──────────────┬──────────────┐
            │  freee       │ マネフォ     │ QB / Xero    │
            │  会計        │ クラウド     │ Zoho / Sage  │
            │              │              │ NetSuite     │
            └──────────────┴──────────────┴──────────────┘
```

---

## 4. 中核概念

### 4.1 Buyer (購入者)

- LemonCake にアカウント登録した企業・個人
- 残高 (USDC) を事前チャージして、エージェントに使わせる
- `Buyer JWT` という長期 API キーを持つ (ダッシュボード → Settings → API で発行)

### 4.2 Pay Token (ペイトークン)

- **Buyer JWT を使って発行される短期 JWT**
- 仕様:
  - `serviceId`: 使用先サービス ID (例: `demo_agent_search_api`)
  - `limitUsdc`: このトークンで消費できる上限 (例: `"0.50"`)
  - `expiresInSeconds`: 有効期限 (60秒〜30日)
  - `sandbox`: true なら USDC を動かさず上限管理だけ走る
- エージェントはこの JWT を `Authorization: Bearer <pay-token>` として有料 API を叩く
- 上限到達 or 期限切れで自動失効

**なぜこの設計か:**
- Buyer JWT を直接エージェントに渡すと全権限が漏れる → Pay Token で権限を `serviceId × 上限 × 時間` にスコープ限定
- エージェント暴走時は Buyer JWT ではなく Pay Token だけ revoke すれば済む

### 4.3 KYA (Know Your Agent) Tier

- 人間の KYC と対称的に設計したエージェント認証層
- 3層: `NONE` / `KYA` / `KYC`
- ティアごとに日次上限 (`dailyLimitUsdc`) が決まる
  - `NONE`: $10/日 (お試し)
  - `KYA`: $100/日 (エージェント登録済み)
  - `KYC`: $10,000/日 (法人 KYC 完了)
- Buyer 単位で上限が enforced される

### 4.4 Kill Switch (緊急停止)

- `PATCH /api/tokens/:id/revoke` で **アトミックに** トークン失効
- Race condition 対策: revoke と課金が同時発生した場合、revoke が勝つ設計 (DB レベルでトランザクション)
- 失効後の課金試行は HTTP 422 で拒否

### 4.5 Charge (課金)

- Pay Token 経由で上流 API を呼び出した際の課金レコード
- Prisma モデル:
  ```prisma
  model Charge {
    id             String       @id
    buyerId        String
    serviceId      String
    amountUsdc     Decimal      @db.Decimal(38, 18)
    status         ChargeStatus // PENDING / COMPLETED / FAILED
    txHash         String?      // USDC 送金の tx ハッシュ
    idempotencyKey String       @unique
    createdAt      DateTime
  }
  ```
- `idempotencyKey` でネットワーク retry による二重課金を防止

### 4.6 ChargeRollup (ロールアップ)

- 数万件の Charge を日次/月次で1本の仕訳にまとめて会計ソフトへ同期
- 大量 M2M 決済を会計ソフトの Deal/Journal 数制限から守る仕組み

---

## 5. 技術スタック

### 5.1 API (バックエンド)

| レイヤー | 技術 |
|---|---|
| Runtime | Node.js 20+ / TypeScript 5.6 |
| Web framework | Hono + @hono/zod-openapi + @hono/swagger-ui |
| ORM | Prisma 5.22 |
| DB | PostgreSQL (Supabase hosted) |
| Queue | BullMQ (Redis) |
| JWT | jose 5.9 |
| Blockchain | viem (Polygon RPC) |
| Auth | JWT (HS256, 署名鍵は `JWT_SECRET` env) |
| Deploy | Railway |

### 5.2 ダッシュボード (フロント)

| レイヤー | 技術 |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS |
| State | 素の `useState` / `useEffect` (Zustand 等なし) |
| Auth storage | localStorage (`admin_token`, `buyer_token`) |
| Deploy | Vercel |

### 5.3 ブロックチェーン

- **チェーン:** Polygon (Arbitrum ではない、要注意)
- **通貨:** USDC (Circle 発行) / JPYC (日本円ステーブルコイン)
- **RPC:** `POLYGON_RPC_URL` env
- **送金:** viem `writeContract` で ERC-20 transfer

### 5.4 フィアット入口

- **Stripe** (クレカ → USDC 変換)
- **JPYC** (銀行振込 → JPYC → USDC へ DEX 経由)

---

## 6. プロダクト展開 (SDK / プラグイン)

LemonCake API は "AI エージェントのエコシステムすべて" に入り込む戦略。現時点で以下を提供:

### 6.1 Dify プラグイン (`integrations/dify/lemoncake/`)

- Python 製プラグイン (dify-plugin==0.7.4)
- 4ツール: `issue_pay_token` / `check_balance` / `revoke_token` / `list_charges`
- Dify Marketplace 審査中 (PR #2298)
- 言語: 英語・日本語・中国語 (manifest の localization キー)

### 6.2 MCP Server (`mcp-server/`)

- Model Context Protocol 準拠
- Claude Desktop / Cursor / Cline 等で使える
- npm: `lemon-cake-mcp`
- ツール: `setup` / `list_services` / `call_service` / `check_balance` / `check_tax` / `get_service_stats`

### 6.3 Eliza プラグイン (`eliza-plugin-lemoncake/`)

- ElizaOS v2 (`@elizaos/core >= 2.0.0-alpha.1`)
- npm: `eliza-plugin-lemoncake`
- アクション: `EXECUTE_LEMONCAKE_PAYMENT` (自然言語トリガー)
- 2モード: Quickstart (PAY_TOKEN 固定) / Production (BUYER_JWT で都度発行)

### 6.4 Coze プラグイン (進行中)

- ByteDance Coze 向け
- 中国・日本両市場狙い

---

## 7. 日本特化の会計機能

ここが LemonCake の差別化ポイント。他社(Skyfire, Coinbase AgentKit)には無い。

### 7.1 自動仕訳

Charge が `COMPLETED` になったら、Buyer が接続した会計ソフトに自動で仕訳登録:

- **freee** (日本 No.1) — `POST /api/1/deals` でディール作成
- **マネーフォワード クラウド** — `POST /api/v1/journals` で仕訳伝票作成
- **QuickBooks Online** (北米 No.1) — OAuth + Intuit API
- **Xero** (豪・英) — OAuth + Xero API
- **Zoho Books** (アジア・中東) — OAuth + Zoho API
- **Sage** (欧州・北米中堅) — OAuth + Sage API
- **Oracle NetSuite** (大企業) — TBA 認証 + RESTlet

### 7.2 国税庁 API 連携

- 請求書発行元の `T + 13桁番号` を国税庁の適格請求書発行事業者公表サイト API で検証
- `verified` フラグを Charge に付与
- 適格 → 10% 課税仕入 / 非適格 → 対象外 の税区分自動判定

### 7.3 源泉徴収の自動計算

- 個人事業主への支払いで源泉徴収義務が発生する場合を自動判定
- 源泉税率 10.21% (100万超は 20.42%) で控除
- 仕訳で `外注費 / 預り金 / 普通預金` の3行起票

---

## 8. セキュリティ設計

### 8.1 JWT 認証の階層

- **Admin JWT**: プラットフォーム管理者用 (`verifyAdminToken`)
- **Buyer JWT**: 長期 API キー (`verifyBuyerToken`)
- **Pay Token**: 短期・スコープ限定 (`serviceId + limit + expiry` を claim に含む)

### 8.2 OAuth state JWT

- 会計ソフト OAuth start → callback の間で CSRF 防止
- 10分有効の state JWT を発行、callback で検証
- state に `buyerId + provider + nonce` を含む

### 8.3 Token 暗号化保存

- 会計ソフトの access_token / refresh_token は DB 保存時に `encryptToken()` で暗号化
- 復号鍵は `TOKEN_ENCRYPTION_KEY` env

### 8.4 Idempotency

- `POST` / `PATCH` 全エンドポイントで `Idempotency-Key` ヘッダ必須 (または自動生成)
- DB の `Charge.idempotencyKey` unique 制約で二重課金を物理防止

### 8.5 Rate Limit

- OAuth start: buyer 単位で 15分 5回まで
- `oauthStartRateLimit` Map でインメモリ実装

---

## 9. ビジネスモデル

### 9.1 収益源

1. **Buyer 手数料**: 各課金の 2〜5% をプラットフォーム手数料として徴収
2. **KYC Tier 月額**: `KYC` 層は月額サブスク ($99〜)
3. **Service Provider 紹介料**: マーケットプレイスに登録された有料 API 提供者から成約の 10〜20%
4. **エンタープライズ契約**: NetSuite 連携や SSO 必要な大企業向け

### 9.2 ターゲット

- **短期(日本)**: freee / マネフォ を使っている中小企業・スタートアップで AI エージェントを本番運用したい層
- **中期(アジア)**: Zoho を使う東南アジア・インド企業
- **長期(グローバル)**: QuickBooks / Xero を使う北米・豪州企業

---

## 10. 競合比較

| 項目 | LemonCake | Skyfire | Coinbase AgentKit | Stripe |
|---|---|---|---|---|
| エージェント用 Pay Token | ✅ | ✅ | ❌ | ❌ |
| Kill Switch | ✅ | 〜 | ❌ | ✅(限定的) |
| Idempotency Key 必須 | ✅ | ❌ | ❌ | ✅ |
| 日本会計ソフト連携 | ✅(7社) | ❌ | ❌ | ❌ |
| 国税庁適格請求書検証 | ✅ | ❌ | ❌ | ❌ |
| 源泉徴収自動控除 | ✅ | ❌ | ❌ | ❌ |
| JPYC 対応 | ✅ | ❌ | ❌ | ❌ |
| Dify/Eliza/MCP 公式連携 | ✅ | 一部 | 一部 | ❌ |
| 本体チェーン | Polygon | Base | Base | 銀行網 |

**差別化の本質:** Skyfire は米国市場向けで日本会計無し、AgentKit は crypto-native だが会計機能無し。LemonCake は「日本の AI エージェント運用を税務・会計まで含めて完結させる」唯一の選択肢。

---

## 11. 現在の実装状況 (2026年4月時点)

### ✅ 本番稼働中

- API (api.lemoncake.xyz) — Railway
- Dashboard (lemoncake.xyz) — Vercel
- USDC 課金 + Pay Token 発行・revoke
- freee 自動仕訳
- QuickBooks / Xero / Zoho / Sage / NetSuite OAuth
- 国税庁 API 照合
- 源泉徴収自動控除
- MCP server (npm published)
- Eliza plugin (npm published)
- Dify plugin (v0.0.7、Marketplace 審査中 PR #2298)

### 🚧 開発中 (2026 Q2)

- マネーフォワード OAuth (コード実装済、Railway env 未投入)
- Coze プラグイン
- X Ads 学習キャンペーン (¥10,000)
- Qiita / note の SEO 施策
- ChargeRollup の月次実装

### 📋 ロードマップ

- KYC Tier の 3D Secure 代替 (Persona 連携)
- Slack / Discord bot で残高通知
- GraphQL API 追加
- Solana チェーン対応

---

## 12. ファイル構造 (重要ポイントだけ)

```
adhunt-pro/
├── api/                        # Hono API (Railway)
│   ├── src/
│   │   ├── index.ts            # エントリーポイント
│   │   ├── routes/             # 各エンドポイント
│   │   │   ├── tokens.ts       # Pay Token 発行・revoke
│   │   │   ├── charge.ts       # 課金・送金
│   │   │   ├── buyers.ts       # 購入者 CRUD
│   │   │   ├── accounting.ts   # 会計ソフト統合 OAuth
│   │   │   ├── freee.ts        # freee 特化
│   │   │   ├── jpyc.ts         # JPYC 入金
│   │   │   ├── tax.ts          # 国税庁 API
│   │   │   ├── admin.ts        # 管理者 KPI
│   │   │   └── proxy.ts        # 上流 API プロキシ
│   │   ├── lib/
│   │   │   ├── freee.ts        # freee SDK wrapper
│   │   │   ├── money-forward.ts # MF SDK wrapper
│   │   │   ├── accounting.ts   # 統合会計レイヤー
│   │   │   ├── jwt.ts          # JWT 署名検証
│   │   │   └── usdc.ts         # viem ラッパー
│   │   └── workers/            # BullMQ ワーカー
│   └── prisma/schema.prisma
├── dashboard/                  # Next.js (Vercel)
│   └── app/
│       ├── page.tsx            # Buyer SPA (5000+ 行モノリス)
│       ├── admin/page.tsx      # 管理者画面
│       └── integrations/freee/ # freee ランディング
├── mcp-server/                 # MCP server (npm)
├── eliza-plugin-lemoncake/     # Eliza plugin (npm)
└── integrations/dify/          # Dify plugin (Marketplace)
```

---

## 13. 典型的なユースケース

### 13.1 Web 検索エージェント

```
User → Claude Desktop: "AI agent payments について調べて"
  └─ Claude が MCP 経由で LemonCake を呼ぶ
      └─ call_service(serviceId="demo_agent_search_api", limitUsdc="0.50")
          └─ LemonCake が Pay Token 発行 → 上流 API 呼出 → USDC 課金
              └─ Charge 記録 → freee に自動仕訳
                  └─ 結果を Claude が要約して返答
```

### 13.2 Dify ワークフロー

```
Dify Agent: "この3記事を要約して"
  └─ issue_pay_token(service_id="jina-reader", limit_usdc=2, expires_in_seconds=600)
      └─ jina-reader プラグインが Pay Token を Bearer で使用
          └─ 3記事分の課金発生 → list_charges で集計
              └─ "使用料 $0.045 USDC でした"
```

### 13.3 Eliza エージェント

```
User → Eliza: "LemonCake で demo_agent_search_api を 0.50 USDC で呼び出して"
  └─ EXECUTE_LEMONCAKE_PAYMENT アクション発火
      └─ LLM がパラメータ自動抽出 (serviceId, limitUsdc, body)
          └─ resolvePayToken → callService → 結果返却
```

---

## 14. よくある質問に対する模範回答

**Q: LemonCake と Stripe の違いは?**
A: Stripe は人間のチェックアウト前提。LemonCake は M2M (Machine-to-Machine) 前提で、Pay Token による権限委譲、アトミック kill switch、idempotency 必須、日本会計ソフト連携が組み込まれている。

**Q: なぜ Polygon を選んだ?**
A: USDC のガス費用が安く (<$0.01)、JPYC も Polygon ネイティブで、finality も数秒。Arbitrum も候補だったが JPYC の流動性で Polygon に決定。

**Q: セルフホストできる?**
A: はい。API は MIT/BSL 相当、dashboard は MIT。`MF_CLIENT_ID` 等を自前の OAuth アプリで差し替え、Railway / Vercel と同等環境にデプロイすれば動く。

**Q: 開発者向けに何から始められる?**
A: `npm install lemon-cake-mcp` で Claude Desktop に追加するのが最速(3分)。`lemoncake.xyz/register` で無料アカウント作成 → Dashboard で $5 チャージ → Buyer JWT を環境変数に設定。

**Q: 審査はどこまで厳しい?**
A: NONE tier は無審査で即開始($10/日)。KYA tier はエージェント登録フォーム提出で 1営業日。KYC tier は法人登記・マイナンバー・本人確認で数日。

---

## 15. 連絡先・参考資料

- **サイト:** https://lemoncake.xyz
- **ドキュメント:** https://lemoncake.xyz/docs
- **API リファレンス:** https://api.lemoncake.xyz/docs (Swagger UI)
- **ソースコード:** https://github.com/evidai/lemon-cake
- **問合せ:** contact@aievid.com
- **Discord:** (lemoncake.xyz のフッターから)
- **法人情報:** EvidAI (所在地: 日本、適格請求書発行事業者登録番号: T+13桁)

---

**最終更新:** 2026-04-23
