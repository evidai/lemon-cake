import Link from "next/link";
import ContactButton from "../ContactButton";

export const metadata = {
  title: "LEMON cake — E2E AAE Infrastructure",
  description: "End-to-end AAE infrastructure for AI agents to complete real-world business. Tax, compliance, M2M payments, and accounting — fully automated. Code pays code.",
};

// ── SVG Icons ────────────────────────────────────────────────────────────────
const IconZap = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
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

// ── Data ──────────────────────────────────────────────────────────────────────
const whyItems = [
  {
    eyebrow: "Cognitive Expansion",
    title: "Instant access to\ncognitive capabilities",
    body: "From web search to multimodal processing — agents acquire the capabilities they need with a single API call. Information gathering, analysis, and decision-making that takes humans days completes in milliseconds.",
    stats: [
      { num: "32+", label: "Integrated APIs" },
      { num: "<1s", label: "Response latency" },
    ],
    flipped: false,
  },
  {
    eyebrow: "Global Compliance",
    title: "Navigate every regulation\nwith code",
    body: "Qualified invoicing, corporate due diligence, tax risk assessment — work that normally takes specialists days is processed by agents in real time. Whatever country's rules apply, Lemon Cake absorbs them.",
    stats: [
      { num: "Auto", label: "Tax & billing" },
      { num: "KYB", label: "Corp. verification" },
    ],
    flipped: true,
  },
  {
    eyebrow: "Idempotent M2M Payments",
    title: "Zero double-charges.\nReliable M2M payments.",
    body: "USDC-based micropayments deliver value transfers between agents with certainty. Even when network failures or retries occur, the same payment is never executed twice.",
    stats: [
      { num: "USDC", label: "Payment currency" },
      { num: "0", label: "Double-charge risk" },
    ],
    flipped: false,
  },
  {
    eyebrow: "Physical World & Back-Office",
    title: "From purchase order\nto ledger — fully automated",
    body: "From autonomous materials ordering to journal entry generation and accounting system integration — all automatic. Agent decisions break out of the digital world and drive real business directly.",
    stats: [
      { num: "Full auto", label: "Journaling & bookkeeping" },
      { num: "AAE", label: "Orders to accounting" },
    ],
    flipped: true,
  },
];

const buyerFeatures = [
  "Grant agents safe payment capabilities with a Pay Token",
  "Control risk by setting spending limits and expiry dates",
  "Agents autonomously select APIs and complete payments instantly",
  "Send stablecoins and they're reflected as USDC balance immediately",
  "KYA/KYC tiers manage daily limits in graduated steps",
  "Monitor all charge history and balances in the dashboard in real time",
];

const sellerFeatures = [
  "Register your API and publish to the marketplace same day",
  "Reach a new, untapped customer base: AI agents",
  "Real-time aggregation of charge counts and cumulative revenue",
  "After approval, service fees are automatically deposited to your wallet",
  "Set your service type and price freely",
  "Revenue flows in 24/7 without human sales or marketing",
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AboutPageEn() {
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
              {[
                { label: "Infrastructure", href: "#infrastructure" },
                { label: "Use Cases",      href: "#use-cases" },
                { label: "Developers",     href: "#stack" },
              ].map(({ label, href }) => (
                <a key={label} href={href} className="text-[13px] text-white/50 hover:text-white/90 transition-colors">{label}</a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/about" className="text-[13px] text-white/40 hover:text-white/70 transition-colors">
              日本語
            </Link>
            <Link href="/login" className="text-[13px] text-white/50 hover:text-white/80 transition-colors">
              Log in
            </Link>
            <ContactButton className="text-[13px] font-semibold px-4 py-1.5 bg-white text-[#06060a] rounded-lg hover:bg-white/90 transition-colors">
              Contact
            </ContactButton>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="bg-[#fffd43] w-full">
        <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/8 border border-black/12 text-[#1a0f00]/70 text-[11px] font-semibold mb-8 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a0f00]/50 animate-pulse flex-shrink-0" />
            E2E AAE Infrastructure
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-[#1a0f00] mb-6 leading-[1.08]">
            Code pays code.<br />
            <span className="text-black">
              We handle the rest.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[#1a0f00]/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            In the age where code drives the economy,<br className="hidden md:block" />
            we take on all the messy, real-world work.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a0f00] text-white font-semibold rounded-xl hover:bg-[#1a0f00]/80 transition-colors text-sm"
            >
              Get started free <IconArrowRight />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Mission ── */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">Mission</p>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
          From thought to real-world payment,<br />seamlessly connected.
        </h2>
        <p className="text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed">
          For AI agents to "complete real-world business," massive barriers exist — complex tax systems in every country, counterparty due diligence, currency fluctuations, audit-ready accounting — all bound by local rules. Lemon Cake is the E2E AAE infrastructure that lets agents clear every one of these walls through a single endpoint.
        </p>
      </section>

      {/* ── The Infrastructure ── */}
      <section id="infrastructure" className="max-w-6xl mx-auto px-6 pb-8">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-20">The Infrastructure</p>
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
      <div id="use-cases" className="bg-white w-full">
        <section className="max-w-6xl mx-auto px-6 py-28">
          <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Use Cases</p>
          <h2 className="text-center text-3xl md:text-4xl font-black text-gray-900 mb-16 leading-tight">
            Buyers and sellers alike —<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c8b800] to-[#a89400]">connected through a trusted network</span>
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
              <h3 className="text-xl font-black text-gray-900 mb-2">Focus solely on sharpening your AI's intelligence.</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                Just hand a Pay Token to your agent. Tax, compliance, payments, accounting — all the messy operational work of business is handled by Lemon Cake. You focus on building smarter AI.
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
              <h3 className="text-xl font-black text-gray-900 mb-2">Sell to AI. Open a new revenue stream.</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                Register your existing API on LEMON cake and AI agents around the world become your new customers. While humans miss late-night and holiday hours, agents never stop consuming your service.
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
            Raw steel, transformed into<br />
            <span className="text-[#fffd43]">a single bite of lemon cake.</span>
          </h2>
          <div className="text-left max-w-2xl mx-auto space-y-5 text-[15px] text-white/50 leading-relaxed">
            <p>
              Building an AAE (Autonomous Agent Economy) was, at its core, a hellish experience of working with cold, indigestible "raw steel." Translating complex tax law, financial infrastructure, and international compliance into code is an unglamorous grind beyond imagination.
            </p>
            <p>
              We hid all of that complexity and sourness behind the platform.
            </p>
            <p className="text-white/80 font-medium">
              What developers and agents touch is a single, elegantly simple endpoint. Like a delicious lemon cake — born from a complex combination of ingredients, yet consumed in a single perfect bite.
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
              Focus solely on sharpening<br />your AI's intelligence.
            </h2>
            <p className="text-[14px] text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              All the messy operational work of business is handled by Lemon Cake.<br />Reach out for onboarding support, technical consultation, or a demo.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <ContactButton className="inline-flex items-center gap-2 px-7 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors text-sm">
                Open contact form
              </ContactButton>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-7 py-3 bg-gray-100 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Log in
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
              <p className="text-[12px] text-white/30 leading-relaxed">AAE Autonomous Agent Economy<br />Payment Infrastructure</p>
            </div>
            {/* Product */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Product</p>
              <ul className="flex flex-col gap-2">
                {["Infrastructure", "Pricing", "Documentation", "API Reference"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* Use Cases */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Use Cases</p>
              <ul className="flex flex-col gap-2">
                {["Agent Payments", "M2M Transactions", "Back-Office Automation", "Compliance"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* Legal */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Legal</p>
              <ul className="flex flex-col gap-2">
                {["Terms of Service", "Privacy Policy", "Specified Commercial Transactions", "Contact"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40 hover:text-white/70 transition-colors cursor-pointer">{item}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/8 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-white/20">© 2026 LEMON cake. All rights reserved.</p>
            <p className="text-[11px] text-white/20">KYA/KYC Tier Auth · JWT Pay Token · Polygon · USDC · E2E AAE</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
