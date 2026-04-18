import Link from "next/link";
import ContactButton from "../ContactButton";
import AuthedRedirect from "../AuthedRedirect";

export const metadata = {
  title: "LemonCake — M2M Payment Infrastructure for AI Agents",
  description: "JWT-based Pay Tokens + USDC balance management for autonomous Machine-to-Machine payments. Give your AI agent a wallet with a kill switch. Works with Claude, Cursor, Eliza.",
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
const IconPower = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
  </svg>
);
const IconBadge = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
  </svg>
);
const IconBeaker = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M4.5 3h15"/><path d="M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3"/><path d="M6 14h12"/>
  </svg>
);
// ── Data ──────────────────────────────────────────────────────────────────────
const whyItems = [
  {
    eyebrow: "JWT Pay Token",
    title: "Delegate spending power\nwith a hard cap",
    body: "All you hand the agent is a Pay Token. Set the USDC limit, expiry, and target service up front — your agent gets autonomous payment capability with zero runaway risk. The moment the limit is reached, payments stop automatically.",
    stats: [
      { num: "JWT", label: "Pay Token format" },
      { num: "USDC", label: "Settlement currency" },
    ],
    flipped: false,
  },
  {
    eyebrow: "Marketplace",
    title: "Agents choose,\nagents pay",
    body: "APIs listed on the LemonCake marketplace are discovered, called, and paid for autonomously by agents. M2M transactions that need no human approval, all through a single proxy endpoint.",
    stats: [
      { num: "M2M", label: "Autonomous transactions" },
      { num: "1", label: "Unified proxy API" },
    ],
    flipped: true,
  },
  {
    eyebrow: "Idempotent Payments",
    title: "Zero double charges.\nReliable micro-payments.",
    body: "Every call gets an auto-assigned UUID Idempotency-Key. Network failures and timeout retries can never cause the same payment to execute twice.",
    stats: [
      { num: "UUID", label: "Auto idempotency key" },
      { num: "0", label: "Double-charge risk" },
    ],
    flipped: false,
  },
  {
    eyebrow: "JPYC → USDC",
    title: "Deposit in JPYC,\nspend in USDC",
    body: "Send the JPY-pegged stablecoin JPYC and it reflects as USDC balance instantly. Manage treasury in yen while the agent pays globally in USDC. Polygon ERC-20 means settlement costs stay near zero.",
    stats: [
      { num: "JPYC", label: "Deposit currency" },
      { num: "Polygon", label: "Chain" },
    ],
    flipped: true,
  },
];

const buyerFeatures = [
  "Grant agents safe payment capability with Pay Tokens",
  "Control risk with spending limits, expiry, and scoped services",
  "Agents autonomously select APIs and complete payments instantly",
  "Send JPYC on-chain and it reflects as USDC balance immediately",
  "KYA/KYC tiers manage daily limits in graduated steps",
  "Real-time monitoring of charges, balance, and token usage",
];

const sellerFeatures = [
  "Register your API and publish to the marketplace same day",
  "Reach AI agents — an entirely new, untapped customer segment",
  "Real-time aggregation of call counts and cumulative revenue",
  "Service fees deposit automatically to your wallet after approval",
  "Set service type and per-call price freely",
  "24/7 revenue with no human sales, no human marketing",
];

const integrations = [
  {
    icon: <IconTerminal />,
    badge: "npm · lemon-cake-mcp",
    title: "MCP server",
    subtitle: "Plug into Claude / Cursor",
    body: "Start with npx in a single command. Append to claude_desktop_config.json and Claude Desktop or Cursor immediately gets every LemonCake capability.",
    code: `npx lemon-cake-mcp`,
    tools: ["list_services", "call_service", "check_balance", "setup"],
    href: "https://www.npmjs.com/package/lemon-cake-mcp",
    published: true,
  },
  {
    icon: <IconPackage />,
    badge: "npm · eliza-plugin-lemoncake",
    title: "Eliza v2 plugin",
    subtitle: "@elizaos/core v2 compatible",
    body: "Add it to character.plugins and your Eliza agent can run EXECUTE_LEMONCAKE_PAYMENT. Supports both PAY_TOKEN and BUYER_JWT modes.",
    code: `npm install eliza-plugin-lemoncake`,
    tools: ["EXECUTE_LEMONCAKE_PAYMENT", "PAY_WITH_LEMONCAKE", "M2M_PAYMENT"],
    href: "https://www.npmjs.com/package/eliza-plugin-lemoncake",
    published: true,
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AboutPageEn() {
  return (
    <div className="min-h-screen bg-[#06060a] text-white font-sans antialiased">
      <AuthedRedirect />

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
                { label: "Integrations", href: "#integrations" },
                { label: "Features",     href: "#features" },
                { label: "Quickstart",   href: "#quickstart" },
                { label: "How it works", href: "#infrastructure" },
                { label: "Use cases",    href: "#use-cases" },
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
        <section className="max-w-6xl mx-auto px-6 pt-32 pb-28 text-center">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-[#1a0f00] mb-6 leading-[1.08]">
            Code pays code.<br />
            <span className="text-black">
              We handle the rest.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[#1a0f00]/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            AI agents autonomously pick APIs, pay, and finish the job.<br className="hidden md:block" />
            We ship the whole mechanism.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#1a0f00] text-white font-semibold rounded-xl hover:bg-[#1a0f00]/80 transition-colors text-sm"
            >
              Issue a Pay Token <IconArrowRight />
            </Link>
          </div>
        </section>
      </div>

      {/* ── Integrations ── */}
      <section id="integrations" className="relative overflow-hidden py-28">
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
        <div className="relative z-10 max-w-6xl mx-auto px-6">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-4">Integrations</p>
        <h2 className="text-center text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
          Connect your agent<br />in 3 minutes
        </h2>
        <p className="text-center text-[14px] text-white/40 mb-16 max-w-xl mx-auto">
          First-party packages for the most popular agent frameworks — Claude, Cursor, Eliza, and any REST client.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {integrations.map(({ icon, badge, title, subtitle, body, code, tools, href, published }) => (
            <div key={title} className="rounded-3xl bg-white/4 border border-white/8 p-8 flex flex-col gap-6">
              {/* Header */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-[#fffd43]/10 border border-[#fffd43]/20 flex items-center justify-center text-[#fffd43]">
                    {icon}
                  </div>
                  <span className="text-[11px] font-mono text-white/30 bg-white/5 px-2 py-0.5 rounded">{badge}</span>
                  {published && (
                    <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">✓ published</span>
                  )}
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
                See on npm <IconArrowRight />
              </a>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-28">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-4">Features</p>
        <h2 className="text-center text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
          Three safety rails<br />built into every token
        </h2>
        <p className="text-center text-[14px] text-white/40 mb-16 max-w-xl mx-auto">
          Kill the runaway. Unlock bigger budgets after identity checks. Dry-run without moving real money.<br />
          Everything from one dashboard.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Kill Switch */}
          <div className="rounded-3xl bg-gradient-to-br from-red-500/10 to-red-500/[0.02] border border-red-500/20 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                <IconPower />
              </div>
              <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Kill Switch</span>
            </div>
            <h3 className="text-xl font-black text-white mb-2">One-click revocation</h3>
            <p className="text-[13px] text-white/45 leading-relaxed mb-5">
              Revoke any issued Pay Token instantly. The moment your agent starts doing something unexpected, all payments stop. Subsequent charge requests are rejected with 422.
            </p>
            <div className="mt-auto flex flex-col gap-2 text-[12px] text-white/50">
              <div className="flex items-center gap-2"><span className="text-red-400"><IconCheck /></span>Atomic revoke (race-condition-free)</div>
              <div className="flex items-center gap-2"><span className="text-red-400"><IconCheck /></span>Owner-only operation</div>
              <div className="flex items-center gap-2"><span className="text-red-400"><IconCheck /></span>Dashboard → Pay Tokens tab</div>
            </div>
          </div>

          {/* KYA */}
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.02] border border-emerald-500/20 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <IconBadge />
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Know Your Agent</span>
            </div>
            <h3 className="text-xl font-black text-white mb-2">Tiered limits via KYA</h3>
            <p className="text-[13px] text-white/45 leading-relaxed mb-5">
              Declare your agent&apos;s name and purpose — KYA verified instantly. Daily limit jumps from 10 to 1,000 USDC. Full KYC unlocks 50,000 USDC/day.
            </p>
            <div className="mt-auto flex flex-col gap-2 text-[12px] text-white/50">
              <div className="flex items-center gap-2"><span className="text-emerald-400"><IconCheck /></span>NONE: 10 USDC/day</div>
              <div className="flex items-center gap-2"><span className="text-emerald-400"><IconCheck /></span>KYA: 1,000 USDC/day (instant)</div>
              <div className="flex items-center gap-2"><span className="text-emerald-400"><IconCheck /></span>KYC: 50,000 USDC/day</div>
            </div>
          </div>

          {/* Sandbox */}
          <div className="rounded-3xl bg-gradient-to-br from-purple-500/10 to-purple-500/[0.02] border border-purple-500/20 p-8 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <IconBeaker />
              </div>
              <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Sandbox</span>
            </div>
            <h3 className="text-xl font-black text-white mb-2">Risk-free end-to-end test</h3>
            <p className="text-[13px] text-white/45 leading-relaxed mb-5">
              Tokens issued with the Sandbox flag never move a real USDC. Limit accounting, charge logs, and proxy forwarding all behave identically to production — dry-run your agent with confidence.
            </p>
            <div className="mt-auto flex flex-col gap-2 text-[12px] text-white/50">
              <div className="flex items-center gap-2"><span className="text-purple-400"><IconCheck /></span>Real balance untouched</div>
              <div className="flex items-center gap-2"><span className="text-purple-400"><IconCheck /></span>Limits &amp; idempotency match prod</div>
              <div className="flex items-center gap-2"><span className="text-purple-400"><IconCheck /></span>TEST badge on each row</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quickstart ── */}
      <section id="quickstart" className="max-w-5xl mx-auto px-6 py-28">
        <p className="text-center text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-4">Quickstart</p>
        <h2 className="text-center text-3xl md:text-4xl font-black text-white mb-4 leading-tight">
          Ship in <span className="text-[#fffd43]">5 minutes</span>
        </h2>
        <p className="text-center text-[14px] text-white/40 mb-16 max-w-xl mx-auto">
          Register, issue a Pay Token, hand it to your agent. That&apos;s it.
        </p>

        <ol className="flex flex-col gap-5">
          {/* Step 1 */}
          <li className="rounded-3xl bg-white/4 border border-white/8 p-7 flex gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#fffd43] text-[#1a0f00] font-black text-lg flex items-center justify-center">1</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-black text-white mb-1.5">Create an account &amp; deposit USDC</h3>
              <p className="text-[13px] text-white/45 leading-relaxed mb-3">
                Sign up with just an email. For testing, use Sandbox tokens and skip the deposit entirely — the full flow works without a single real USDC.
              </p>
              <Link href="/register" className="inline-flex items-center gap-1.5 text-[13px] text-[#fffd43]/80 hover:text-[#fffd43]">
                Register <IconArrowRight />
              </Link>
            </div>
          </li>

          {/* Step 2 */}
          <li className="rounded-3xl bg-white/4 border border-white/8 p-7 flex gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#fffd43] text-[#1a0f00] font-black text-lg flex items-center justify-center">2</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-black text-white mb-1.5">Issue a Pay Token</h3>
              <p className="text-[13px] text-white/45 leading-relaxed mb-3">
                From the Pay Tokens tab, pick the target service, USDC limit, and expiry. Toggle Sandbox mode to keep your real balance untouched.
              </p>
              <div className="rounded-xl bg-black/40 border border-white/8 px-4 py-3 font-mono text-[12px] text-[#fffd43] leading-relaxed overflow-x-auto">
                <div className="text-white/40">$ # or via REST:</div>
                <div>curl -X POST https://lemoncake.xyz/api/tokens \</div>
                <div className="pl-4">-H &quot;Authorization: Bearer $BUYER_JWT&quot; \</div>
                <div className="pl-4">-d &apos;{'{'}&quot;serviceId&quot;:&quot;svc_xxx&quot;,&quot;limitUsdc&quot;:&quot;2.00&quot;,&quot;sandbox&quot;:true{'}'}&apos;</div>
              </div>
            </div>
          </li>

          {/* Step 3 */}
          <li className="rounded-3xl bg-white/4 border border-white/8 p-7 flex gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#fffd43] text-[#1a0f00] font-black text-lg flex items-center justify-center">3</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-black text-white mb-1.5">Hand it to your agent</h3>
              <p className="text-[13px] text-white/45 leading-relaxed mb-4">
                One line in whichever framework you use. The agent autonomously picks APIs, pays, and completes the task.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl bg-black/40 border border-white/8 px-3.5 py-3">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">Claude / Cursor</p>
                  <code className="text-[12px] font-mono text-[#fffd43] break-all">npx lemon-cake-mcp</code>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/8 px-3.5 py-3">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">Eliza v2</p>
                  <code className="text-[12px] font-mono text-[#fffd43] break-all">plugins: [lemonCakePlugin]</code>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/8 px-3.5 py-3">
                  <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">Any framework</p>
                  <code className="text-[12px] font-mono text-[#fffd43] break-all">POST /api/proxy/:id/*</code>
                </div>
              </div>
            </div>
          </li>

          {/* Step 4 */}
          <li className="rounded-3xl bg-gradient-to-br from-[#fffd43]/10 to-transparent border border-[#fffd43]/20 p-7 flex gap-6">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#fffd43] text-[#1a0f00] font-black text-lg flex items-center justify-center">✓</div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-black text-white mb-1.5">Done — just watch it run</h3>
              <p className="text-[13px] text-white/55 leading-relaxed">
                Charges, balance, and token usage stream into the dashboard in real time.<br />
                If the agent goes rogue, hit Kill Switch — one click, instant stop.
              </p>
            </div>
          </li>
        </ol>

        <div className="mt-10 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-7 py-3 bg-[#fffd43] text-[#1a0f00] font-semibold rounded-xl hover:bg-[#fffd43]/90 transition-colors text-sm"
          >
            Start for free <IconArrowRight />
          </Link>
          <p className="mt-3 text-[12px] text-white/30">
            No credit card. With Sandbox mode, no USDC either.
          </p>
        </div>
      </section>

      {/* ── Mission ── */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">Mission</p>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
          Give your agent<br />a safe wallet.
        </h2>
        <p className="text-base md:text-lg text-white/45 max-w-2xl mx-auto leading-relaxed">
          Every external API an AI agent touches demands billing, auth, idempotency, and balance accounting. LemonCake hands your agent a &quot;wallet with a cap&quot; via a JWT Pay Token. Cross the cap, and it stops. Agents get spending power without going feral.
        </p>
      </section>

      {/* ── Buyer / Seller 2-column ── */}
      <div id="use-cases" className="bg-white w-full mt-28">
        <section className="max-w-6xl mx-auto px-6 py-28">
          <p className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">Use Cases</p>
          <h2 className="text-center text-3xl md:text-4xl font-black text-gray-900 mb-16 leading-tight">
            Buyers and sellers<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c8b800] to-[#a89400]">on one trusted network</span>
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
              <h3 className="text-xl font-black text-gray-900 mb-2">Focus only on making your AI smarter</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
                Hand a Pay Token to your agent. Payments, balance, idempotency — all handled by LemonCake. You only worry about the agent&apos;s logic.
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
                Register your existing API on LemonCake and the world&apos;s AI agents become your new customers. Late nights, holidays — agents never stop using your service.
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

      {/* ── The Infrastructure ── */}
      <section id="infrastructure" className="max-w-6xl mx-auto px-6 py-28">
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

      {/* ── Philosophy ── */}
      <section className="px-6 pt-28 pb-40 text-center">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-6">Our Philosophy</p>
          <h2 className="text-3xl md:text-4xl font-black text-white leading-tight mb-8">
            Raw steel, transformed into<br />
            <span className="text-[#fffd43]">a single bite of lemon cake.</span>
          </h2>
          <div className="text-left max-w-2xl mx-auto space-y-5 text-[15px] text-white/50 leading-relaxed">
            <p>
              Building M2M payment infrastructure used to mean handling cold, indigestible &quot;raw steel.&quot; Idempotency guarantees, balance accounting, KYA/KYC tiers, USDC smart contracts — rebuilding all of that from scratch is not where agent developers should be spending their time.
            </p>
            <p>
              We hid all that sour complexity behind the platform.
            </p>
            <p className="text-white/80 font-medium">
              What developers and agents touch is a single, elegantly simple endpoint. Like a delicious lemon cake — born from a complex combination of ingredients, consumed in a single perfect bite.
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
              Focus only on making<br />your AI smarter.
            </h2>
            <p className="text-[14px] text-gray-500 mb-8 max-w-md mx-auto leading-relaxed">
              Payments, balance, and idempotency — all handled by LemonCake.<br />Reach out for onboarding support, technical consultation, or a demo.
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
                <img src="/logo.png" alt="LemonCake" className="w-6 h-6 rounded-md object-cover" />
                <span className="font-bold text-[13px] text-white">LemonCake</span>
              </div>
              <p className="text-[12px] text-white/30 leading-relaxed">M2M Payment Infrastructure<br />for AI Agents</p>
            </div>
            {/* Product */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Product</p>
              <ul className="flex flex-col gap-2">
                {[
                  { label: "Dashboard",    href: "/login" },
                  { label: "MCP server",   href: "https://www.npmjs.com/package/lemon-cake-mcp" },
                  { label: "Eliza plugin", href: "https://www.npmjs.com/package/eliza-plugin-lemoncake" },
                  { label: "Documentation", href: "https://lemoncake.xyz/docs" },
                ].map(({ label, href }) => (
                  <li key={label}>
                    <a href={href} className="text-[12px] text-white/40 hover:text-white/70 transition-colors">{label}</a>
                  </li>
                ))}
              </ul>
            </div>
            {/* Use Cases */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Use Cases</p>
              <ul className="flex flex-col gap-2">
                {["Agent payments", "M2M transactions", "API marketplace", "Micro-payments"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40">{item}</span></li>
                ))}
              </ul>
            </div>
            {/* Legal */}
            <div>
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest mb-3">Legal</p>
              <ul className="flex flex-col gap-2">
                {["Terms of Service", "Privacy Policy", "Specified Commercial Transactions", "Contact"].map(item => (
                  <li key={item}><span className="text-[12px] text-white/40">{item}</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-white/8 pt-6 flex flex-col md:flex-row items-center justify-between gap-2">
            <p className="text-[11px] text-white/20">© 2026 LemonCake. All rights reserved.</p>
            <p className="text-[11px] text-white/20">KYA/KYC tier auth · JWT Pay Token · Polygon · USDC · JPYC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
