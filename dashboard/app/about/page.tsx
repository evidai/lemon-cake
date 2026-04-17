import Link from "next/link";
import ContactButton from "./ContactButton";

export const metadata = {
  title: "LemonCake — M2M Payment Infrastructure for AI Agents",
  description: "AIエージェントが自律的にAPIを呼び出し、USDC で支払いを完結させるための M2M 決済インフラ。JWT Pay Token で予算を制御し、エージェントに安全な支払い能力を付与。",
};

// ── SVG Icons ────────────────────────────────────────────────────────────────
const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconShield = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IconStore = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconTerminal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
);
const IconPackage = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ── Data ──────────────────────────────────────────────────────────────────────
const whyItems = [
  {
    eyebrow: "JWT Pay Token",
    title: "予算上限付きの\n支払い能力を委譲",
    body: "エージェントに渡すのは Pay Token だけ。上限 USDC・有効期限・対象サービスをあらかじめ設定するので、暴走リスクなしに自律決済を委任できます。上限に達した瞬間、支払いは自動停止します。",
    stats: [
      { num: "JWT", label: "Pay Token 形式" },
      { num: "USDC", label: "決済通貨" },
    ],
    flipped: false,
  },
  {
    eyebrow: "Marketplace",
    title: "AIエージェントが\n選んで、払う",
    body: "LemonCake マーケットプレイスに登録された API は、エージェントが自律的に選択・呼び出し・支払いまで完結します。人間の承認を必要としない M2M トランザクションを、単一のプロキシエンドポイントで実現します。",
    stats: [
      { num: "M2M", label: "自律トランザクション" },
      { num: "1本", label: "プロキシ API" },
    ],
    flipped: true,
  },
  {
    eyebrow: "Idempotent Payments",
    title: "二重課金ゼロ。\n確実なマイクロペイメント",
    body: "呼び出しごとに UUID の Idempotency-Key を自動付与。ネットワーク障害・タイムアウトによる再試行が起きても、同じ決済が 2 回実行されることはありません。",
    stats: [
      { num: "UUID", label: "冪等キー自動付与" },
      { num: "0件", label: "二重課金リスク" },
    ],
    flipped: false,
  },
  {
    eyebrow: "JPYC → USDC",
    title: "JPYCで入金して\nUSDCで支払う",
    body: "ステーブルコイン JPYC を送金するだけで USDC 残高に即時反映。円建てで資金管理しながら、グローバルな USDC マイクロペイメントを実行できます。Polygon ベースの ERC-20 トークンで決済コストも最小化。",
    stats: [
      { num: "JPYC", label: "入金通貨" },
      { num: "Polygon", label: "チェーン" },
    ],
    flipped: true,
  },
];

const buyerFeatures = [
  "Pay Token でエージェントに安全な支払い能力を付与",
  "利用上限・有効期限・対象サービスを設定してリスクをコントロール",
  "エージェントが自律的に API を選び、即座に支払い完了",
  "JPYC を送るだけで USDC 残高として即時反映",
  "KYA/KYC ティアで 1 日あたりの限度額を段階管理",
  "すべての課金履歴・残高をダッシュボードでリアルタイム確認",
];

const sellerFeatures = [
  "API を登録して即日マーケットプレイスに公開",
  "AIエージェントという新しい未開拓の顧客層にリーチ",
  "課金回数・累計収益をリアルタイム集計",
  "審査通過後、サービス利用料がウォレットに自動入金",
  "サービスタイプ・単価を自由に設定",
  "人間の営業・マーケなしに 24 時間収益が入り続ける",
];

const integrations = [
  {
    icon: <IconTerminal />,
    badge: "npm · lemon-cake-mcp",
    title: "MCP サーバー",
    subtitle: "Claude / Cursor に即接続",
    body: "npx lemon-cake-mcp で起動するだけ。claude_desktop_config.json に追記すれば、Claude Desktop・Cursor がすぐに LemonCake の全機能を使えます。",
    code: `npx lemon-cake-mcp`,
    tools: ["list_services", "call_service", "get_balance", "setup"],
    href: "https://www.npmjs.com/package/lemon-cake-mcp",
  },
  {
    icon: <IconPackage />,
    badge: "npm · eliza-plugin-lemoncake",
    title: "Eliza v2 プラグイン",
    subtitle: "@elizaos/core v2 対応",
    body: "character.plugins に追加するだけで、Eliza エージェントが EXECUTE_LEMONCAKE_PAYMENT アクションを使えるようになります。PAY_TOKEN / BUYER_JWT の 2 モード対応。",
    code: `npm install eliza-plugin-lemoncake`,
    tools: ["EXECUTE_LEMONCAKE_PAYMENT", "PAY_WITH_LEMONCAKE", "M2M_PAYMENT"],
    href: "https://www.npmjs.com/package/eliza-plugin-lemoncake",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#06060a] text-white font-sans antialiased">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-20 bg-[#06060a]/90 backdrop-blur-md border-b border-white/8">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="LemonCake" className="w-7 h-7 rounded-lg object-cover" />
              <span className="font-bold text-[15px] text-white">LemonCake</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {[
                { label: "仕組み",       href: "#infrastructure" },
                { label: "ユースケース", href: "#use-cases" },
                { label: "インテグレーション", href: "#integrations" },
              ].map(({ label, href }) => (
                <a key={label} href={href} className="text-[13px] text-white/50 hover:text-white/90 transition-colors">{label}</a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-[13px] text-white/50 hover:text-white/80 transition-colors">
              ログイン
            </Link>
            <ContactButton className="text-[13px] font-semibold px-4 py-1.5 bg-white text-[#06060a] rounded-lg hover:bg-white/90 transition-colors">
              お問い合わせ
            </ContactButton>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="bg-[#fffd43] w-full">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-[#1a0f00] mb-6 leading-[1.08]">
            Code pays code.<br />
            <span className="text-black">
              We handle the rest.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[#1a0f00]/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            AIエージェントが自律的にAPIを選び、支払い、完結する。<br className="hidden md:block" />
            その仕組みをまるごと提供します。
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a0f00] text-white font-semibold rounded-xl hover:bg-[#1a0f00]/80 transition-colors text-sm"
            >
              Pay Token を発行する <IconArrowRight />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Mission ── */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">ミッション</p>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
          エージェントに、<br />安全なお財布を渡す
        </h2>
        <p className="text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed">
          AIエージェントが外部 API を呼び出すたびに、課金・認証・冪等性・残高管理が必要になります。
          LemonCake は JWT Pay Token という仕組みで、エージェントに「予算上限付きのお財布」を渡します。
          上限を超えれば自動停止。エージェントは支払い能力を持ちながら、暴走しません。
        </p>
      </section>

      {/* ── The Infrastructure ── */}
      <section id="infrastructure" className="max-w-6xl mx-auto px-6 pb-8">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-20">How It Works</p>
        <div className="flex flex-col gap-28">
          {whyItems.map(({ eyebrow, title, body, stats, flipped }) => (
            <div
              key={eyebrow}
              className={`flex flex-col md:flex-row items-center gap-12 ${flipped ? "md:flex-row-reverse" : ""}`}
            >
              {/* Text side */}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#fffd43]/80 uppercase tracking-widest mb-3">{eyebrow}</p>
                <h3 className="text-2xl md:text-3xl font-black text-white mb-4 leading-tight whitespace-pre-line">{title}</h3>
                <p className="text-[14px] text-white/45 leading-relaxed max-w-md">{body}</p>
              </div>
              {/* Stats side */}
              <div className="flex-shrink-0 w-full md:w-72">
                <div className="rounded-3xl bg-white/4 border border-white/8 p-8 flex gap-8 justify-center md:justify-start">
                  {stats.map(({ num, label }) => (
                    <div key={label}>
                      <p className="text-3xl font-black text-white mb-1">{num}</p>
                      <p className="text-[11px] text-white/40 leading-tight">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Buyer / Seller 2-column ── */}
      <div id="use-cases" className="bg-white w-full mt-28">
        <section className="max-w-6xl mx-auto px-6 py-28">
          <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Use Cases</p>
          <h2 className="text-center text-3xl md:text-4xl font-black text-gray-900 mb-16 leading-tight">
            払う側も、売る側も<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c8b800] to-[#a89400]">信頼されたネットワークで繋がる</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Buyer */}
            <div className="rounded-3xl bg-gray-50 border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-500">
                  <IconZap />
                </div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">BUYER / AGENT OPERATOR</p>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">AIの知能を磨くことだけに集中する</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                Pay Token をエージェントに渡すだけ。決済・残高管理・冪等性はすべて LemonCake が処理します。あなたはエージェントのロジックだけに集中してください。
              </p>
              <ul className="flex flex-col gap-3">
                {buyerFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                    <span className="text-emerald-500 mt-0.5"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            {/* Seller */}
            <div className="rounded-3xl bg-gray-50 border border-gray-200 p-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[#fffd43]/20 border border-[#c8b800]/30 flex items-center justify-center text-[#a89400]">
                  <IconStore />
                </div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">SELLER / API PROVIDER</p>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">AIに売り、新しい収益源を開く</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                既存の API を LemonCake に登録するだけで、世界中の AI エージェントが新しい顧客になります。人間が見落とす深夜・休日も、エージェントは止まらずサービスを使い続けます。
              </p>
              <ul className="flex flex-col gap-3">
                {sellerFeatures.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                    <span className="text-emerald-500 mt-0.5"><IconCheck /></span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* ── Integrations ── */}
      <section id="integrations" className="max-w-6xl mx-auto px-6 py-28">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-4">Integrations</p>
        <h2 className="text-center text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
          あなたのエージェントに<br />3 分で接続する
        </h2>
        <p className="text-center text-[14px] text-white/40 mb-16 max-w-xl mx-auto">
          Claude・Cursor・Eliza など主要なフレームワークに対応した公式パッケージを提供しています。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {integrations.map(({ icon, badge, title, subtitle, body, code, tools, href }) => (
            <div key={title} className="rounded-3xl bg-white/4 border border-white/8 p-8 flex flex-col gap-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-[#fffd43]/10 border border-[#fffd43]/20 flex items-center justify-center text-[#fffd43]">
                    {icon}
                  </div>
                  <span className="text-[11px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded">{badge}</span>
                </div>
                <h3 className="text-xl font-black text-white mb-0.5">{title}</h3>
                <p className="text-[12px] text-white/40">{subtitle}</p>
              </div>
              {/* Body */}
              <p className="text-[13px] text-white/50 leading-relaxed">{body}</p>
              {/* Code block */}
              <div className="rounded-xl bg-black/40 border border-white/8 px-4 py-3 font-mono text-[13px] text-[#fffd43]">
                $ {code}
              </div>
              {/* Tools */}
              <div className="flex flex-wrap gap-2">
                {tools.map(t => (
                  <span key={t} className="text-[11px] font-mono text-white/40 bg-white/5 border border-white/8 px-2 py-0.5 rounded-md">{t}</span>
                ))}
              </div>
              {/* Link */}
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] text-[#fffd43]/70 hover:text-[#fffd43] transition-colors mt-auto">
                npm で見る <IconArrowRight />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Philosophy ── */}
      <section className="relative overflow-hidden px-6 pt-28 pb-40 text-center">
        {/* Video background */}
        <video
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          src="/dvd_screensaver.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-[#06060a]/40" />
        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">Our Philosophy</p>
          <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-8">
            鋼鉄の素材を、<br />
            <span className="text-[#fffd43]">ひと口のレモンケーキに。</span>
          </h2>
          <div className="text-left max-w-2xl mx-auto space-y-5 text-[15px] text-white/50 leading-relaxed">
            <p>
              M2M 決済インフラを構築するとは、本来「鋼鉄の素材」を扱うような体験でした。冪等性の担保、残高管理、KYA/KYC ティア認証、USDC スマートコントラクト——これらをゼロから実装することは、エージェント開発者にとって本質的でない負荷です。
            </p>
            <p>
              私たちは、その複雑で酸っぱい現実のすべてを、プラットフォームの裏側に隠しました。
            </p>
            <p className="text-white/80 font-medium">
              開発者やエージェントが触れるのは、極めてシンプルに洗練された 1 つのエンドポイントだけ。まるで、複雑な素材の組み合わせから生まれた、ひと口で食べられる美味しい「レモンケーキ」のように。
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <div className="bg-white w-full">
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-28 text-center">
          <div className="rounded-3xl bg-gray-50 border border-gray-200 px-8 py-16">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Ready to Power AI Transactions?</p>
            <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4 leading-tight">
              AIの知能を磨くことだけに<br />集中してください。
            </h2>
            <p className="text-[14px] text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              決済・残高管理・冪等性はすべて LemonCake が処理します。<br />導入支援・技術相談・デモのリクエストはこちら。
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <ContactButton className="inline-flex items-center gap-2 px-7 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors text-sm">
                お問い合わせフォームを開く
              </ContactButton>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3 bg-gray-100 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                ログイン
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-white/8 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src="/logo.png" alt="LemonCake" className="w-6 h-6 rounded-md object-cover" />
                <span className="font-bold text-[13px] text-white">LemonCake</span>
              </div>
              <p className="text-[12px] text-white/30 leading-relaxed">M2M Payment Infrastructure<br />for AI Agents</p>
            </div>
            {/* プロダクト */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">プロダクト</p>
              <ul className="flex flex-col gap-2">
                {[
                  { label: "ダッシュボード", href: "/login" },
                  { label: "MCP サーバー",  href: "https://www.npmjs.com/package/lemon-cake-mcp" },
                  { label: "Eliza Plugin",  href: "https://www.npmjs.com/package/eliza-plugin-lemoncake" },
                  { label: "ドキュメント",  href: "https://lemoncake.xyz/docs" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} className="text-[12px] text-white/40 hover:text-white/70 transition-colors">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
            {/* ユースケース */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">ユースケース</p>
              <ul className="flex flex-col gap-2">
                {["エージェント決済", "M2M 取引", "API マーケットプレイス", "マイクロペイメント"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* 法的情報 */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">法的情報</p>
              <ul className="flex flex-col gap-2">
                {["利用規約", "プライバシーポリシー", "特定商取引法", "お問い合わせ"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40">{item}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/8 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-white/20">© 2026 LemonCake. All rights reserved.</p>
            <p className="text-[11px] text-white/20">KYA/KYC ティア認証 · JWT Pay Token · Polygon · USDC · JPYC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
