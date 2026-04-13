import Link from "next/link";
import ContactButton from "./ContactButton";

export const metadata = {
  title: "LEMON cake — AI Agent M2M Payment Infrastructure",
  description: "AIエージェント同士がリアルタイムで課金・決済できるM2Mインフラ。KYA/KYCティア認証とJWTベースのPay Tokenで安全な自律決済を実現。",
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
const IconGlobe = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
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

// ── Data ──────────────────────────────────────────────────────────────────────
const whyItems = [
  {
    eyebrow: "Autonomous Payments",
    title: "人間の介入なしに\n即座に決済",
    body: "エージェントはAPIを呼ぶたびに自律的に支払いを完了させます。承認待ち、クレジットカード入力、人間のサインオフは不要。AIの速度で動く決済が、ビジネスの速度を変えます。",
    stats: [
      { num: "<1s", label: "課金処理レイテンシ" },
      { num: "24/7", label: "ノンストップ稼働" },
    ],
    flipped: false,
  },
  {
    eyebrow: "New Revenue Streams",
    title: "AIに売る。\n未開拓の市場へ",
    body: "既存のAPIをLEMON cakeに登録するだけで、世界中のAIエージェントが新しい顧客になります。人間が見落とす深夜・休日も、エージェントは止まらずにあなたのサービスを使い続けます。",
    stats: [
      { num: "∞", label: "エージェント顧客" },
      { num: "USDC", label: "自動入金" },
    ],
    flipped: true,
  },
  {
    eyebrow: "KYA Identity",
    title: "エージェントに\n認証済みのアイデンティティを",
    body: "Know Your Agent（KYA）/ Know Your Customer（KYC）の2層構造でリスクを制御。JWTベースのPay Tokenが各エージェントの身元を証明し、自律的なアカウント作成とサービスアクセスを可能にします。",
    stats: [
      { num: "3", label: "KYA/KYCティア" },
      { num: "JWT", label: "認証プロトコル" },
    ],
    flipped: false,
  },
  {
    eyebrow: "Seamless Transactions",
    title: "シームレスな\nM2Mトランザクション",
    body: "サービスリクエスト → KYA認証 → 決済処理。この3ステップがミリ秒で完結します。BullMQの非同期キューがオンチェーン転送を処理し、エージェントのパフォーマンスに影響を与えません。",
    stats: [
      { num: "3", label: "トランザクションステップ" },
      { num: "Polygon", label: "決済チェーン" },
    ],
    flipped: true,
  },
];

const buyerFeatures = [
  "Pay Tokenでエージェントに安全な支払い能力を付与",
  "利用上限・有効期限を設定してリスクをコントロール",
  "エージェントが自律的にAPIを選び、即座に支払い完了",
  "JPYCを送るとUSDC残高として即時反映",
  "KYA/KYCティアで1日あたりの限度額を段階管理",
  "すべての課金履歴・残高をダッシュボードでリアルタイム確認",
];

const sellerFeatures = [
  "APIを登録して即日マーケットプレイスに公開",
  "AIエージェントという新しい未開拓の顧客層にリーチ",
  "課金回数・累計収益をリアルタイム集計",
  "審査通過後に自動でUSDC受取が開始",
  "サービスタイプ・単価を自由に設定",
  "人間の営業・マーケなしに24時間収益が入り続ける",
];

const stack = [
  { label: "Frontend", value: "Next.js 14 (App Router) + Tailwind CSS" },
  { label: "API", value: "Hono + OpenAPI (Zod)" },
  { label: "Database", value: "PostgreSQL (Supabase) + Prisma ORM" },
  { label: "Auth", value: "Jose JWT — Buyer / Admin" },
  { label: "Queue", value: "BullMQ + Redis" },
  { label: "Chain", value: "Polygon — USDC / JPYC ERC-20" },
  { label: "Protocol", value: "KYA/KYC ティア認証 + JWT Pay Token" },
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
              <img src="/logo.png" alt="LEMON cake" className="w-7 h-7 rounded-lg object-cover" />
              <span className="font-bold text-[15px] text-white">LEMON cake</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
              {["機能", "ユースケース", "開発者向け", "会社概要"].map(label => (
                <span key={label} className="text-[13px] text-white/50 hover:text-white/90 transition-colors cursor-pointer">{label}</span>
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/8 border border-black/12 text-[#1a0f00]/70 text-[11px] font-semibold mb-8 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a0f00]/50 animate-pulse flex-shrink-0" />
            KYA Identity × Agent Payments
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-[#1a0f00] mb-6 leading-[1.08]">
            The Agentic<br />
            <span className="text-black">
              Commerce Platform
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[#1a0f00]/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            AIの速度で動く決済とアイデンティティ基盤。<br className="hidden md:block" />
            エージェントが自律的に支払い、認証し、サービスにアクセスする。
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a0f00] text-white font-semibold rounded-xl hover:bg-[#1a0f00]/80 transition-colors text-sm"
            >
              無料で始める <IconArrowRight />
            </Link>
          </div>
        </section>
      </div>


      {/* ── Mission ── */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">ミッション</p>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
          AIエコノミーのために設計された<br />決済とアイデンティティ
        </h2>
        <p className="text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed">
          LEMON cakeはエージェントに決済処理・身元確認・必要なサービスへの自律アクセスを提供します。
          APIアカウントの自動作成からサービスのマネタイズまで——
          人間の介入なしに、AIの速度でグローバル決済を駆動します。
        </p>
      </section>

      {/* ── Why LEMON cake? ── */}
      <section className="max-w-6xl mx-auto px-6 pb-8">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-20">Why LEMON cake?</p>
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
      <div className="bg-white w-full">
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
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">BUYER</p>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">人間なしで即座に支払う</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                Pay Tokenをエージェントに渡すだけ。エージェントが必要なAPIを自律的に選び、KYA認証を通じて身元を証明し、人間の介入なしに決済を完了させます。
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
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">SELLER</p>
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">AIに売り、新しい収益源を開く</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                既存のAPIをLEMON cakeに登録するだけで、AIエージェントという新しい未開拓の顧客層にリーチ。ウェブサイトのマネタイズからAPIの収益化まで、24時間止まらない収益源が生まれます。
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


      {/* ── CTA ── */}
      <div className="bg-white w-full">
        <section className="max-w-6xl mx-auto px-6 pb-28 text-center">
        <div className="rounded-3xl bg-gray-50 border border-gray-200 px-8 py-16">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Ready to Power AI Transactions?</p>
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4 leading-tight">
            AIトランザクションを<br />動かす準備はできていますか？
          </h2>
          <p className="text-[14px] text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
            エージェントに支払い・認証・サービスへの自律アクセスを。<br />導入支援・技術相談・デモのリクエストはこちら。
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
                <img src="/logo.png" alt="LEMON cake" className="w-6 h-6 rounded-md object-cover" />
                <span className="font-bold text-[13px] text-white">LEMON cake</span>
              </div>
              <p className="text-[12px] text-white/30 leading-relaxed">AI Agent M2M<br />Payment Infrastructure</p>
            </div>
            {/* プロダクト */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">プロダクト</p>
              <ul className="flex flex-col gap-2">
                {["機能", "料金", "ドキュメント", "APIリファレンス"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* ユースケース */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">ユースケース</p>
              <ul className="flex flex-col gap-2">
                {["AI検索エージェント", "コード実行", "データ分析", "ドキュメント処理"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* 法的情報 */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">法的情報</p>
              <ul className="flex flex-col gap-2">
                {["利用規約", "プライバシーポリシー", "特定商取引法", "お問い合わせ"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/8 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-white/20">© 2026 LEMON cake. All rights reserved.</p>
            <p className="text-[11px] text-white/20">KYA/KYC ティア認証 · JWT Pay Token · Polygon · JPYC · USDC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
