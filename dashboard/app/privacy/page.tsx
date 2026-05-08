import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー — LemonCake",
  description:
    "LemonCake が AI エージェントの USDC 課金を仲介する際に取得・保存・送信するデータと、それらの取り扱いに関する方針。",
};

const LAST_UPDATED = "2026-05-07";

const sections: Array<{ id: string; en: string; ja: string; body: string }> = [
  {
    id: "overview",
    en: "Overview",
    ja: "概要",
    body: `LemonCake (運営: Evid AI / contact@aievid.com) は AI エージェントが有料 API を USDC で従量課金しながら利用するためのマーケットプレイスです。本ポリシーは LemonCake のダッシュボード (lemoncake.xyz)、API (api.lemoncake.xyz)、npm パッケージ \`lemon-cake-mcp\` および \`create-lemon-agent\` で取り扱う情報を対象とします。`,
  },
  {
    id: "data-we-collect",
    en: "Data we collect",
    ja: "取得するデータ",
    body: `1. アカウント情報: メールアドレス、表示名、ハッシュ化されたパスワード (email サインアップ時のみ)、Google OAuth の sub ID。
2. 決済情報: Stripe Customer ID、Coinbase Commerce charge ID、課金トランザクション履歴 (金額・タイムスタンプ・冪等性キー・サービス ID)。
3. ウォレット情報: バイヤーが手動で登録した Polygon ウォレットアドレス (送金先用)。LemonCake は秘密鍵を取得・保管しません。
4. エージェント識別子: Pay Token に紐づく \`buyerTag\`、\`agentName\`、\`agentDescription\` (任意入力)。
5. テクニカルログ: API リクエスト IP、User-Agent、X-LemonCake-Client ヘッダ、Charge レコードのリクエスト/レスポンスハッシュ (SHA-256)。本文そのものは保存しません。
6. 会計連携: 連携済みの freee / Money Forward / QuickBooks 認可トークン (暗号化済み、自動仕訳目的のみ)。`,
  },
  {
    id: "how-we-use",
    en: "How we use data",
    ja: "データの利用目的",
    body: `- 課金処理 (Pay Token 発行、charge 確定、provider への USDC 送金、手数料計算)
- アカウント管理 (ログイン、KYC ステータス、KYA / KYC 段階管理)
- 不正検知 (リスクスコア、レート制限、Token 無効化)
- 会計連携 (連携同意済みの会計ソフトに仕訳を自動投稿)
- 法令遵守 (国税庁適格請求書照合、源泉徴収判定 — 日本居住者のみ)
- サービス改善 (集計済みのテレメトリのみ。個人特定可能情報を含む形での解析は行いません)`,
  },
  {
    id: "third-parties",
    en: "Third-party services",
    ja: "第三者サービス",
    body: `LemonCake は以下の事業者と限定的にデータを共有します。各社のプライバシーポリシーは各社サイトをご参照ください。
- Stripe (カード/銀行振込決済) — 決済情報
- Coinbase Commerce (USDC 直接決済) — メールアドレス、charge ID
- Anthropic / Google (OAuth サインアップ時) — メールアドレス、表示名
- freee / Money Forward / QuickBooks (会計連携した場合のみ) — 仕訳金額・取引先名
- Polygon ネットワーク (USDC 送金) — 送信元/送金先ウォレットアドレス、金額。Polygon は public blockchain のため、これらは公開情報です。
- マーケットプレイス上の各 Provider (例: Hunter.io, Serper, Firecrawl) — エージェントが call_service で叩いた path / body。LemonCake はリクエスト本文を保存しませんが、Provider 側のログには残ります。`,
  },
  {
    id: "retention",
    en: "Data retention",
    ja: "データ保管期間",
    body: `- 課金トランザクション (Charge / PlatformRevenue / ProviderPayout): 7 年 (日本の電子帳簿保存法に準拠)
- アカウント情報: アカウント削除リクエスト後 30 日以内に消去 (法令で保管義務がある会計データを除く)
- API ログ (テクニカル): 90 日でローリング削除
- Pay Token: 失効 (\`expiresAt\`) または revoke 後 90 日でメタデータ削除
- 会計連携トークン: 連携解除と同時に即時削除`,
  },
  {
    id: "security",
    en: "Security",
    ja: "セキュリティ",
    body: `- 通信は全て HTTPS (TLS 1.2+)
- パスワードは bcrypt でハッシュ化、原文は保存しません
- HOT_WALLET / Treasury の秘密鍵は本番環境変数 (Railway / GCP Secret Manager) で管理、リポジトリには commit しません
- Stripe / Coinbase webhook は HMAC SHA-256 署名検証
- 脆弱性報告: SECURITY.md に従ってください (https://github.com/evidai/lemon-cake/blob/main/SECURITY.md)`,
  },
  {
    id: "your-rights",
    en: "Your rights",
    ja: "ユーザーの権利",
    body: `日本居住者は個人情報保護法、EU 居住者は GDPR、カリフォルニア州居住者は CCPA に基づき、以下の権利を行使できます。
- アクセス: 当社が保有するあなたのデータの開示請求
- 訂正: 不正確なデータの修正請求
- 削除: アカウント削除によるデータ消去 (法令上保管義務のあるデータを除く)
- 移植: 機械可読形式 (JSON) でのエクスポート

請求は **contact@aievid.com** までメールで。30 日以内に対応します。`,
  },
  {
    id: "cookies",
    en: "Cookies",
    ja: "Cookie / トラッキング",
    body: `lemoncake.xyz は以下の Cookie のみ使用します:
- セッション Cookie (ログイン状態維持) — 必須
- ダークモード等の UI 設定 — 任意

第三者解析 Cookie (Google Analytics 等) は現時点で使用していません。導入時には本ポリシーを更新し、ユーザーに通知します。`,
  },
  {
    id: "ai-agent-specific",
    en: "AI agent specific",
    ja: "AI エージェント特有の事項",
    body: `LemonCake は AI エージェントが自律で paid API を呼ぶことを想定しています。これに伴う特殊な取り扱い:
- **Pay Token は agent に渡される** ことを前提に、強制 expiry / 強制 limit / sandbox flag / scope 限定を提供しています。漏洩時の被害を最小化するためです。
- **エージェントが叩いた API リクエスト本文** (例: Hunter.io への "domain=anthropic.com") は LemonCake サーバー側では SHA-256 ハッシュのみ保存し、原文は保存しません。Provider 側 (Hunter.io 等) のログには保管されます。
- **エージェントの "考えていること"** (LLM のプロンプト本文や思考過程) は LemonCake には一切送信されません。MCP サーバー経由で受け取るのは tool 呼び出しの引数のみです。`,
  },
  {
    id: "changes",
    en: "Changes to this policy",
    ja: "本ポリシーの変更",
    body: `本ポリシーを変更する場合、変更日 30 日前までに登録メールアドレスへ通知し、本ページの "最終更新日" を更新します。継続的に LemonCake を利用することで変更後のポリシーに同意したものとみなします。`,
  },
  {
    id: "contact",
    en: "Contact",
    ja: "お問い合わせ",
    body: `本ポリシー、データ取扱い、削除リクエスト等は以下まで:
- Email: **contact@aievid.com**
- 運営: Evid AI (Tokyo, Japan)
- セキュリティ脆弱性: SECURITY.md (https://github.com/evidai/lemon-cake/blob/main/SECURITY.md)`,
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <Link
            href="/"
            className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block"
          >
            ← LemonCake
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">プライバシーポリシー</h1>
          <p className="text-sm text-gray-500 mt-3">最終更新日: {LAST_UPDATED}</p>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            LemonCake が AI エージェントの USDC 課金を仲介する際に取得・保存・送信するデータと、その取り扱いに関する方針です。
          </p>
        </div>
      </div>

      {/* TOC */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        <nav className="bg-white border border-gray-200 rounded-2xl p-5 mb-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            目次
          </p>
          <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-blue-600 hover:underline">
                  {s.ja}{" "}
                  <span className="text-gray-400 text-xs">({s.en})</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <article className="bg-white border border-gray-200 rounded-2xl p-8 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-8">
              <h2 className="text-xl font-bold text-gray-900 mb-3">
                {i + 1}. {s.ja}{" "}
                <span className="text-gray-400 text-sm font-normal">/ {s.en}</span>
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                {s.body}
              </p>
            </section>
          ))}
        </article>

        {/* Footer note */}
        <p className="text-xs text-gray-400 mt-6 text-center">
          このポリシーは英訳版も準備中です / English version coming soon. 暫定問合先:{" "}
          <a className="underline" href="mailto:contact@aievid.com">
            contact@aievid.com
          </a>
        </p>
      </div>
    </main>
  );
}
