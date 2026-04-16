"use client";

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

// ── i18n ──────────────────────────────────────────────────────────────────────
const LangContext = createContext<"ja" | "en">("ja");
function useT() {
  const l = useContext(LangContext);
  return (ja: string, en: string) => l === "en" ? en : ja;
}
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, TooltipProps,
} from "recharts";

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL       = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const MAX_CHART_PTS = 40;
const MAX_LOG       = 100;

// ── Demo pools ────────────────────────────────────────────────────────────────
const AGENT_IDS   = Array.from({ length: 80 }, (_, i) => `agt_${String(i + 1).padStart(3, "0")}`);
const TIERS       = ["none", "none", "none", "kya", "kya", "kyc"] as const;
const CURRENCIES  = ["USDC", "USDC", "USDC", "JPYC"] as const;
const AMOUNTS_USDC= [1, 5, 10, 25, 50, 100, 250, 500];
const AMOUNTS_JPYC= [100, 500, 1000, 2500, 5000, 10000];
const RISK_SIGNALS= ["velocity_breach","amount_anomaly","circular_payment","budget_breach","unknown_counterparty"];

const DEMO_AGENTS = Array.from({ length: 24 }, (_, i) => {
  const tier = TIERS[Math.floor(Math.random() * TIERS.length)];
  return {
    id: `agt_${String(i + 1).padStart(3, "0")}`,
    tier,
    trustScore:  Math.round(40 + Math.random() * 60),
    successRate: Math.round(85 + Math.random() * 15),
    usedToday:   parseFloat((Math.random() * 500).toFixed(2)),
    dailyLimit:  tier === "kyc" ? 50000 : tier === "kya" ? 1000 : 10,
    suspended:   Math.random() < 0.05,
    lastTx:      new Date(Date.now() - Math.random() * 3_600_000).toLocaleTimeString("ja-JP", { hour12: false }),
  };
});

const DEMO_FLAGS = Array.from({ length: 9 }, (_, i) => ({
  id:        `flag_${String(i + 1).padStart(3, "0")}`,
  agentId:   AGENT_IDS[Math.floor(Math.random() * 20)],
  signal:    RISK_SIGNALS[Math.floor(Math.random() * RISK_SIGNALS.length)],
  riskScore: Math.round(55 + Math.random() * 45),
  resolved:  i >= 7,
  createdAt: new Date(Date.now() - Math.random() * 86_400_000).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const randInt   = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick      = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const fmtNow    = () => new Date().toLocaleTimeString("ja-JP", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtMs     = () => fmtNow() + "." + String(Date.now() % 1000).padStart(3, "0");
const fmtUptime = (s: number) =>
  `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const randHash  = () => `sf_${Array.from({ length: 28 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`;

type TxStatus = "confirmed" | "failed" | "pending" | "blocked";
type Tier     = "none" | "kya" | "kyc";
type Role     = "buyer" | "seller";
type Page     = "home" | "transactions" | "agents" | "usdc" | "jpyc" | "fraud" | "directory" | "account"
              | "seller-services" | "seller-directory" | "seller-account" | "seller-stats";

// ── Service (Directory) ───────────────────────────────────────────────────────
interface Service {
  id: string; name: string; provider: string; type: "API" | "MCP";
  price: number; description: string; tags: string[];
  apiSpecUrl: string; tokenTypes: string[];
  tosUrl?: string; minTokenAmount?: number;
}

// ── localStorage persistence ──────────────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}

const DEMO_SERVICES: Service[] = [
  { id: "svc_001", name: "テストAPIサービス", provider: "テスト", type: "API", price: 0.001, description: "ローカルテスト用サービス", tags: ["test"], apiSpecUrl: "", tokenTypes: ["kyapay"], minTokenAmount: 0.001 },
  { id: "svc_001_weather", name: "Weather Forecast API", provider: "OpenWeather Inc.", type: "API", price: 0.002, description: "リアルタイム気象データと予報を提供するREST API。世界200,000都市に対応。", tags: ["weather","forecast","realtime"], apiSpecUrl: "https://openweathermap.org/api/one-call-3", tokenTypes: ["kya","kyapay"], minTokenAmount: 0.01, tosUrl: "https://openweathermap.org/terms" },
  { id: "svc_002", name: "GPT-4o Inference", provider: "OpenAI", type: "API", price: 0.005, description: "OpenAI GPT-4oモデルへのチャット・補完エンドポイント。マルチモーダル対応。", tags: ["llm","ai","gpt","inference"], apiSpecUrl: "https://platform.openai.com/docs/api-reference", tokenTypes: ["kya","pay","kyapay"], minTokenAmount: 0.005, tosUrl: "https://openai.com/policies/usage-policies" },
  { id: "svc_003", name: "Filesystem MCP Server", provider: "Anthropic OSS", type: "MCP", price: 0.0005, description: "ローカル・クラウドファイルシステムへのアクセスを提供するMCPサーバー。読み書き・検索に対応。", tags: ["filesystem","mcp","storage"], apiSpecUrl: "https://github.com/modelcontextprotocol/servers", tokenTypes: ["kya","kyapay"], minTokenAmount: 0.001 },
  { id: "svc_004", name: "Web Search MCP", provider: "Brave Search", type: "MCP", price: 0.001, description: "ウェブ検索をMCPプロトコル経由で提供。プライバシー重視の検索エンジン。", tags: ["search","web","mcp"], apiSpecUrl: "https://api.search.brave.com/app/documentation", tokenTypes: ["pay","kyapay"], minTokenAmount: 0.001, tosUrl: "https://search.brave.com/help/terms" },
  { id: "svc_005", name: "Tokyo Stock Exchange Data", provider: "JPX Data Cloud", type: "API", price: 0.01, description: "東京証券取引所のリアルタイム株価・指数データ。OHLCV・板情報も提供。", tags: ["finance","stocks","tse","japan"], apiSpecUrl: "https://jpx-jdg.com/api/v2/spec.json", tokenTypes: ["kyc","kyapay"], minTokenAmount: 0.01, tosUrl: "https://jpx-jdg.com/terms" },
  { id: "svc_006", name: "PostgreSQL MCP", provider: "Supabase OSS", type: "MCP", price: 0.0008, description: "PostgreSQLデータベースへのクエリ・スキーマ操作をMCPで提供。SELECT/INSERT対応。", tags: ["database","sql","mcp","postgres"], apiSpecUrl: "https://supabase.com/docs/guides/self-hosting/mcp", tokenTypes: ["kya","kyapay"], minTokenAmount: 0.001 },
  { id: "svc_007", name: "JPYC Payment Gateway", provider: "JPYC Inc.", type: "API", price: 0.0015, description: "JPYCステーブルコイン（Polygon）を使った決済受付・送金API。ERC-20準拠。", tags: ["jpyc","payment","polygon","stablecoin"], apiSpecUrl: "https://jpyc.io/api/v1/openapi.json", tokenTypes: ["kyapay"], minTokenAmount: 100, tosUrl: "https://jpyc.io/terms" },
  { id: "svc_008", name: "Claude 3.5 Haiku", provider: "Anthropic", type: "API", price: 0.00025, description: "高速・軽量なClaudeモデル。エージェント間の低コスト推論タスクに最適。", tags: ["llm","ai","claude","anthropic"], apiSpecUrl: "https://docs.anthropic.com/en/api", tokenTypes: ["kya","pay","kyapay"], minTokenAmount: 0.001, tosUrl: "https://www.anthropic.com/legal/aup" },
  { id: "svc_009", name: "GitHub MCP Server", provider: "GitHub (OSS)", type: "MCP", price: 0.0003, description: "GitHubリポジトリの読み取り・Issue操作・PRレビューをMCPプロトコルで提供。", tags: ["github","git","mcp","devtools"], apiSpecUrl: "https://github.com/github/github-mcp-server", tokenTypes: ["kya","kyapay"], minTokenAmount: 0.001 },
  { id: "svc_010", name: "Image Generation API", provider: "Stability AI", type: "API", price: 0.004, description: "Stable Diffusion XLを使った高品質画像生成。テキスト→画像、img2imgに対応。", tags: ["image","ai","generative","diffusion"], apiSpecUrl: "https://platform.stability.ai/docs/api-reference", tokenTypes: ["pay","kyapay"], minTokenAmount: 0.004, tosUrl: "https://stability.ai/terms-of-service" },
];

interface LogEntry {
  id: string; from: string; to: string; currency: string; amount: number;
  txHash: string | null; status: TxStatus; riskScore: number; flagged: boolean; createdAt: string;
}
interface ChartPoint { t: string; tps: number; }

function makeDummyLog(): LogEntry {
  const currency = pick(CURRENCIES);
  const amount   = currency === "JPYC" ? pick(AMOUNTS_JPYC) : pick(AMOUNTS_USDC);
  let from = pick(AGENT_IDS), to = pick(AGENT_IDS);
  while (to === from) to = pick(AGENT_IDS);
  const riskScore = Math.round(Math.random() * 60);
  const rand = Math.random();
  return {
    id: Math.random().toString(36).slice(2), from, to, currency, amount,
    txHash: rand > 0.06 ? randHash() : null,
    status: rand > 0.06 ? "confirmed" : rand > 0.03 ? "failed" : "blocked",
    riskScore, flagged: riskScore > 50, createdAt: fmtMs(),
  };
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

const TIER_CFG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  none: { bg: "bg-gray-100",   text: "text-gray-500",   border: "border-gray-200",   label: "未認証" },
  kya:  { bg: "bg-violet-50",  text: "text-violet-700", border: "border-violet-200", label: "KYA" },
  kyc:  { bg: "bg-sky-50",     text: "text-sky-700",    border: "border-sky-200",    label: "KYC" },
};

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    // clipboard API → フォールバック: execCommand
    const tryClipboard = navigator.clipboard?.writeText(text).then(() => true).catch(() => false);
    Promise.resolve(tryClipboard ?? Promise.resolve(false)).then((ok) => {
      if (!ok) {
        // HTTP localhost フォールバック
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 bg-navy text-white text-[10px] rounded-lg hover:bg-navy-light transition-colors min-w-[3.5rem]">
      {copied ? t("✓ コピー済", "✓ Copied") : t("コピー", "Copy")}
    </button>
  );
}

function TierBadge({ tier }: { tier: Tier | string }) {
  const t = useT();
  const c = TIER_CFG[tier] ?? TIER_CFG.none;
  const label = c.label === "未認証" ? t("未認証", "Unverified") : c.label;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${c.bg} ${c.text} ${c.border}`}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: TxStatus }) {
  const m: Record<TxStatus, string> = {
    confirmed: "bg-green-50 text-green-700 border-green-200",
    failed:    "bg-red-50   text-red-700   border-red-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    blocked:   "bg-red-50   text-red-700   border-red-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${m[status]}`}>
      {status}
    </span>
  );
}

function Risk({ score }: { score: number }) {
  return (
    <span className={`font-mono font-semibold text-xs ${score >= 70 ? "text-red-600" : score >= 40 ? "text-amber-600" : "text-green-600"}`}>
      {score}
    </span>
  );
}

function ChartTooltipContent({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg px-3 py-2 shadow-sm text-xs font-mono">
      <p className="text-text-muted mb-0.5">{label}</p>
      <p className="text-accent-blue font-semibold">{payload[0].value?.toLocaleString()} tx/s</p>
    </div>
  );
}

// ── Nav icon SVGs (outline, Skyfire-exact style, 20×20) ──────────────────────
function IconHome({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L10 3l7 6.5"/>
      <path d="M5 8.5V17h4v-4h2v4h4V8.5"/>
    </svg>
  );
}
function IconToken({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="6" width="17" height="8" rx="2"/>
      <line x1="6"  y1="8.5" x2="6"  y2="11.5"/>
      <line x1="8"  y1="8.5" x2="8"  y2="11.5"/>
      <line x1="10" y1="8.5" x2="10" y2="11.5"/>
      <line x1="12" y1="8.5" x2="12" y2="11.5"/>
      <line x1="14" y1="8.5" x2="14" y2="11.5"/>
    </svg>
  );
}
function IconClaim({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="8"/>
      <circle cx="10" cy="10" r="3"/>
    </svg>
  );
}
function IconPlayground({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l1.8 5.5H17l-4.6 3.4 1.8 5.5L10 13l-4.2 3.4 1.8-5.5L3 7.5h5.2z"/>
    </svg>
  );
}
function IconUSDC({ cls }: { cls?: string }) {
  // extract size classes (w-* h-*) from cls; ignore color/transition classes for img
  const sizeMatch = (cls ?? "").match(/(w-\S+)\s+(h-\S+)/);
  const sizeClass = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : "w-5 h-5";
  return <img src="/usdc.png" alt="USDC" className={`${sizeClass} rounded-full flex-shrink-0 object-cover`} />;
}
function IconJPYC({ cls }: { cls?: string }) {
  const sizeMatch = (cls ?? "").match(/(w-\S+)\s+(h-\S+)/);
  const sizeClass = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : "w-5 h-5";
  return <img src="/jpyc.png" alt="JPYC" className={`${sizeClass} rounded-full flex-shrink-0 object-cover`} />;
}
function IconApiKey({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="10" r="4"/>
      <path d="M10.5 10h8M16 8v4"/>
    </svg>
  );
}
function IconDirectory({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="7" rx="1.5"/>
      <rect x="11" y="2" width="7" height="7" rx="1.5"/>
      <rect x="2" y="11" width="7" height="7" rx="1.5"/>
      <rect x="11" y="11" width="7" height="7" rx="1.5"/>
    </svg>
  );
}
function IconExternalLink({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-4"/>
      <path d="M15 3h2v2M11 9l6-6"/>
    </svg>
  );
}
function IconSupport({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H6l-3 3V6z"/>
    </svg>
  );
}
function IconStore({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9V17a1 1 0 001 1h12a1 1 0 001-1V9"/>
      <path d="M1 5h18l-1.5 4H2.5L1 5z"/>
      <line x1="8" y1="18" x2="8" y2="12"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
    </svg>
  );
}
function IconStop({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5"/>
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.5"/>
    </svg>
  );
}
function IconChart({ cls }: { cls?: string }) {
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,15 7,9 11,12 18,5"/>
      <line x1="2" y1="18" x2="18" y2="18"/>
    </svg>
  );
}

// ── Sidebar component (Skyfire-exact style) ───────────────────────────────────
type NavItem = { id: Page; label: string; Icon: (p: { cls?: string }) => React.ReactElement };

// ── バイヤー用ナビ ────────────────────────────────────────────
const NAV_BUYER: NavItem[] = [
  { id: "home",         label: "ホーム",               Icon: IconHome },
  { id: "directory",    label: "サービス一覧",          Icon: IconDirectory },
  { id: "transactions", label: "トークン発行",          Icon: IconToken },
  { id: "agents",       label: "販売者向けAPIキー",     Icon: IconApiKey },
  { id: "fraud",        label: "課金履歴",              Icon: IconClaim },
  { id: "usdc",         label: "USDCチャージ",          Icon: IconUSDC },
  { id: "jpyc",         label: "JPYCチャージ",          Icon: IconJPYC },
];

// ── セラー用ナビ ──────────────────────────────────────────────
const NAV_SELLER: NavItem[] = [
  { id: "seller-services",   label: "マイサービス",    Icon: IconStore },
  { id: "seller-stats",      label: "売上統計",        Icon: IconChart },
  { id: "seller-directory",  label: "ディレクトリ",    Icon: IconDirectory },
];

// 後方互換（旧コードが参照している場合用）
const NAV_PRIMARY  = NAV_BUYER;
const NAV_SECONDARY: NavItem[] = [{ id: "directory", label: "ディレクトリ", Icon: IconDirectory }];

function Sidebar({
  page, setPage, role, setRole, isDemoMode, onModeToggle, isHalted,
  connStatus, clock, uptime, openFlags, sellerProfile, onSellerSetup,
  lang, setLang,
}: {
  page: Page; setPage: (p: Page) => void;
  role: Role; setRole: (r: Role) => void;
  isDemoMode: boolean; onModeToggle: () => void;
  isHalted: boolean; connStatus: "connecting" | "ok" | "error";
  clock: string; uptime: number; openFlags: number;
  sellerProfile: SellerProfile | null;
  onSellerSetup: () => void;
  lang: "ja" | "en"; setLang: (l: "ja" | "en") => void;
}) {
  const t = useT();

  const navBuyer: NavItem[] = [
    { id: "home",         label: t("ホーム", "Home"),                 Icon: IconHome },
    { id: "directory",    label: t("サービス一覧", "Services"),         Icon: IconDirectory },
    { id: "transactions", label: t("トークン発行", "Issue Token"),       Icon: IconToken },
    { id: "agents",       label: t("販売者向けAPIキー", "API Keys"),      Icon: IconApiKey },
    { id: "fraud",        label: t("課金履歴", "Charges"),               Icon: IconClaim },
    { id: "usdc",         label: t("USDCチャージ", "USDC Deposit"),      Icon: IconUSDC },
    { id: "jpyc",         label: t("JPYCチャージ", "JPYC Deposit"),      Icon: IconJPYC },
  ];
  const navSeller: NavItem[] = [
    { id: "seller-services",  label: t("マイサービス", "My Services"),   Icon: IconStore },
    { id: "seller-stats",     label: t("売上統計", "Statistics"),         Icon: IconChart },
    { id: "seller-directory", label: t("ディレクトリ", "Directory"),      Icon: IconDirectory },
  ];

  function NavBtn({ id, label, Icon }: NavItem) {
    const active = page === id;
    return (
      <button
        onClick={() => setPage(id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors focus:outline-none group ${
          active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        }`}
      >
        <Icon cls={`w-5 h-5 flex-shrink-0 transition-colors ${active ? "text-gray-900" : "text-gray-400 group-hover:text-gray-600"}`} />
        <span className="font-medium text-[13.5px]">{label}</span>
      </button>
    );
  }

  const nav = role === "buyer" ? navBuyer : navSeller;

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">
      {/* ── Header: ロゴ + 言語切り替え ── */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2">
        <img src="/logo.png" alt="LEMON cake" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
        {/* 言語切り替えボタン */}
        <div className="flex rounded-md border border-gray-200 overflow-hidden text-[10px] font-semibold">
          <button
            onClick={() => setLang("ja")}
            className={`px-2 py-1 transition-colors ${lang === "ja" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >JA</button>
          <button
            onClick={() => setLang("en")}
            className={`px-2 py-1 transition-colors ${lang === "en" ? "bg-navy text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
          >EN</button>
        </div>
      </div>

      {/* ── ロール切り替えタブ: バイヤー / セラー ── */}
      <div className="px-4 pb-3">
        <div className="flex rounded-xl bg-gray-100 p-0.5 gap-0.5">
          {(["buyer", "seller"] as Role[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setPage(r === "buyer" ? "home" : "seller-services");
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                role === r
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {r === "buyer" ? "BUYER" : "SELLER"}
            </button>
          ))}
        </div>
      </div>

      {/* ── ナビ ── */}
      <nav className="px-3 flex flex-col gap-0.5 flex-1">
        {nav.map((item) => <NavBtn key={item.id} {...item} />)}

        {/* セラー: プロフィール未設定の場合はセットアップ誘導 */}
        {role === "seller" && !sellerProfile && (
          <div className="mt-3 mx-1 rounded-2xl bg-[#faf7f2] border border-[#f0e8d8] px-4 py-4">
            <p className="text-[12px] font-bold text-gray-900">{t("販売者プロフィール", "Seller Profile")}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t("サービスを掲載するにはプロフィールを作成してください。", "Create a profile to list your services.")}</p>
            <button
              onClick={onSellerSetup}
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold text-gray-700 hover:text-gray-900 transition-colors"
            >
              {t("プロフィールを作成する →", "Create Profile →")}
            </button>
          </div>
        )}
      </nav>

      {/* ── Bottom: サポート + アカウント（バイヤーのみ） ── */}
      <div className="px-3 pb-3 flex flex-col gap-0.5">
        <div className="mx-1 mb-1 border-t border-gray-100" />
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors focus:outline-none group">
          <IconSupport cls="w-5 h-5 flex-shrink-0 transition-colors text-gray-400 group-hover:text-gray-600" />
          <span className="font-medium text-[13.5px]">{t("サポート", "Support")}</span>
        </button>
        <button onClick={() => setPage(role === "seller" ? "seller-account" : "account")}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors focus:outline-none group ${(page === "account" || page === "seller-account") ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
          <svg className={`w-5 h-5 flex-shrink-0 transition-colors ${(page === "account" || page === "seller-account") ? "text-gray-700" : "text-gray-400 group-hover:text-gray-600"}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="7" r="3"/>
            <path d="M3 17a7 7 0 0114 0"/>
          </svg>
          <span className="font-medium text-[13.5px]">{t("アカウント設定", "Account Settings")}</span>
        </button>
      </div>
    </aside>
  );
}

// ── Page content components ───────────────────────────────────────────────────

function KpiCard({ label, value, unit, sub, color = "default" }: {
  label: string; value: string | number; unit?: string; sub?: string;
  color?: "default" | "green" | "red" | "blue";
}) {
  const vc = { default: "text-text-primary", green: "text-green-600", red: "text-red-600", blue: "text-accent-blue" }[color];
  return (
    <div className="panel rounded-xl p-5 flex flex-col gap-2">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${vc}`}>{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
      </div>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

function TxTable({ logs, isDemoMode }: { logs: LogEntry[]; isDemoMode: boolean }) {
  const t = useT();
  return (
    <div className="panel rounded-xl flex flex-col" style={{ height: 360 }}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">{t("取引ログ", "Transaction Log")}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isDemoMode ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-blue-50 border-blue-200 text-blue-600"}`}>
            {isDemoMode ? "DEMO" : "LIVE"}
          </span>
        </div>
        <span className="text-xs text-text-muted">{logs.length} {t("件", "items")}</span>
      </div>
      <div className="px-5 py-2 border-b border-border grid grid-cols-12 gap-2 flex-shrink-0 bg-canvas">
        {([t("時刻","Time"), t("送信元","From"), t("送信先","To"), t("通貨","Currency"), t("金額","Amount"), "Risk", "Tx Hash", t("状態","Status")] as const).map((h) => (
          <span key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-text-muted ${h === t("状態","Status") ? "col-span-1 text-right" : h === "Tx Hash" ? "col-span-2" : h === t("金額","Amount") || h === "Risk" ? "col-span-1" : "col-span-2"}`}>{h}</span>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border/60">
        {logs.length === 0
          ? <div className="flex items-center justify-center h-full text-text-muted text-sm">{t("データ待機中…", "Waiting for data…")}</div>
          : logs.map((tx) => (
            <div key={tx.id} className="px-5 py-2 grid grid-cols-12 gap-2 items-center hover:bg-canvas text-xs animate-slide-down">
              <span className="col-span-2 font-mono text-text-muted tabular-nums text-[10px]">{tx.createdAt}</span>
              <span className="col-span-2 font-mono text-accent-blue truncate text-[10px]">{tx.from}</span>
              <span className="col-span-2 font-mono text-text-secondary truncate text-[10px]">{tx.to}</span>
              <span className={`col-span-1 font-mono font-semibold text-[10px] ${tx.currency === "JPYC" ? "text-violet-600" : "text-accent-blue"}`}>{tx.currency}</span>
              <span className="col-span-1 font-mono text-text-primary tabular-nums text-[10px]">
                {tx.currency === "JPYC" ? `¥${tx.amount.toLocaleString()}` : `$${tx.amount.toFixed(2)}`}
              </span>
              <span className="col-span-1 text-[10px]"><Risk score={tx.riskScore} /></span>
              <span className="col-span-2 font-mono text-text-muted truncate text-[10px]">{tx.txHash ? tx.txHash.slice(0, 14) + "…" : "—"}</span>
              <div className="col-span-1 flex justify-end"><StatusPill status={tx.status} /></div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Individual pages ──────────────────────────────────────────────────────────

const ONBOARDING_ITEMS = [
  {
    key: "token",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="8" width="28" height="16" rx="3"/>
        <line x1="9"  y1="12" x2="9"  y2="20"/>
        <line x1="12" y1="12" x2="12" y2="20"/>
        <line x1="15" y1="12" x2="15" y2="20"/>
        <line x1="18" y1="12" x2="18" y2="20"/>
        <line x1="21" y1="12" x2="21" y2="20"/>
        <line x1="24" y1="13" x2="24" y2="19"/>
      </svg>
    ),
    titleJa: "トークンの使い方を学びましょう",
    titleEn: "Learn How to Use Tokens",
    descJa: "インタラクティブなプレイグラウンドにアクセスして、トークンの作成方法とサービスへのアクセス方法を学びましょう。デモでは、アプリケーションでトークンを使用する手順を順を追って説明します。",
    descEn: "Access the interactive playground to learn how to create tokens and access services. The demo walks you through the steps of using tokens in your application.",
  },
  {
    key: "verify",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3L4 8v8c0 6.6 5.2 12.8 12 14 6.8-1.2 12-7.4 12-14V8L16 3z"/>
        <polyline points="11 16 14 19 21 12"/>
      </svg>
    ),
    titleJa: "認証を受ける",
    titleEn: "Get Verified",
    descJa: "より多くのサービスをご利用いただくには、本人確認が必要です。一部のプロバイダーは、サービス利用のために追加の本人確認を求めています。",
    descEn: "Identity verification is required to access more services. Some providers require additional verification to use their services.",
  },
  {
    key: "seller",
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11l2-8h22l2 8"/>
        <path d="M3 11h26v16a2 2 0 01-2 2H5a2 2 0 01-2-2V11z"/>
        <path d="M12 27V17h8v10"/>
        <path d="M3 11 Q16 17 29 11"/>
      </svg>
    ),
    titleJa: "販売者アカウントを作成する",
    titleEn: "Create a Seller Account",
    descJa: "ご自身のサービスを提供してみませんか？販売者アカウントを作成して、他のユーザーに価値を提供し、収益を上げましょう。",
    descEn: "Want to offer your own services? Create a seller account to provide value to other users and earn revenue.",
  },
] as const;

function OnboardingChecklist({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setChecked((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  const done = checked.size;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t("購入者オンボーディングチェックリスト", "Buyer Onboarding Checklist")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("LEMON cakeをバイヤーとして利用開始するには、以下の手順を完了してください。", "Complete the steps below to get started as a buyer on LEMON cake.")}</p>
        </div>
        <div className="flex items-center gap-3 ml-4 flex-shrink-0">
          <span className="text-sm font-medium text-gray-400">{done} / {ONBOARDING_ITEMS.length}</span>
          <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 transition-colors focus:outline-none">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
            </svg>
          </button>
        </div>
      </div>
      {/* Cards */}
      <div className="grid grid-cols-3 gap-4">
        {ONBOARDING_ITEMS.map((item) => {
          const isDone = checked.has(item.key);
          return (
            <div key={item.key} className="relative bg-[#faf7f2] rounded-2xl p-5 border border-[#f0e8d8]">
              {/* Checkbox */}
              <button
                onClick={() => toggle(item.key)}
                className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors focus:outline-none ${
                  isDone ? "bg-navy border-navy" : "bg-white border-gray-300 hover:border-gray-400"
                }`}
              >
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1.5 5 4 7.5 8.5 2.5"/>
                  </svg>
                )}
              </button>
              {/* Icon */}
              <div className="text-gray-900 mb-4">{item.icon}</div>
              {/* Text */}
              <p className={`text-sm font-bold leading-snug mb-2 ${isDone ? "text-gray-400 line-through" : "text-gray-900"}`}>{t(item.titleJa, item.titleEn)}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{t(item.descJa, item.descEn)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Buyer types ───────────────────────────────────────────────────────────────
interface Buyer {
  id: string; name: string; email: string;
  balanceUsdc: string; kycTier: "NONE" | "KYA" | "KYC";
  dailyLimitUsdc: string; walletAddress: string | null;
  suspended: boolean; createdAt: string; updatedAt: string;
}

// ── Stripe-style fund modal ────────────────────────────────────────────────────
const STRIPE_AMOUNTS = [5, 10, 25, 50, 100, 250];
function FundModal({ buyer, onClose, onSuccess }: { buyer: Buyer; onClose: () => void; onSuccess: (amount: number) => void; }) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom]     = useState("");
  const [step, setStep]         = useState<"amount" | "card" | "processing" | "done">("amount");
  const [card, setCard]         = useState({ number: "", expiry: "", cvc: "", name: "" });

  const amount = selected ?? (parseFloat(custom) || 0);

  function handlePay() {
    setStep("processing");
    setTimeout(() => { setStep("done"); onSuccess(amount); }, 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t("資金追加先","Fund recipient")}</p>
            <p className="text-sm font-bold text-gray-900">{buyer.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Step: amount */}
          {step === "amount" && (<>
            <p className="text-sm font-semibold text-gray-900 mb-3">{t("金額を選択","Select amount")}</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {STRIPE_AMOUNTS.map((a) => (
                <button key={a} onClick={() => { setSelected(a); setCustom(""); }}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${selected === a ? "bg-navy text-white border-navy" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}>
                  ${a}
                </button>
              ))}
            </div>
            <input type="number" placeholder={t("カスタム金額 (USD)","Custom amount (USD)")} value={custom}
              onChange={(e) => { setCustom(e.target.value); setSelected(null); }}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400 mb-4"/>
            <button disabled={!amount} onClick={() => setStep("card")}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${amount ? "bg-lemon text-text-primary hover:bg-lemon-hover" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {t("続ける","Continue")} → ${amount.toFixed(2)}
            </button>
          </>)}

          {/* Step: card */}
          {step === "card" && (<>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setStep("amount")} className="text-gray-400 hover:text-gray-600">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
              </button>
              <p className="text-sm font-semibold text-gray-900">{t("カード情報を入力","Enter card details")}</p>
              <span className="ml-auto text-sm font-bold text-gray-900">${amount.toFixed(2)}</span>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <input placeholder={t("カード番号","Card number")} maxLength={19} value={card.number}
                onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g,"").replace(/(.{4})/g,"$1 ").trim() })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="MM / YY" maxLength={7} value={card.expiry}
                  onChange={(e) => { let v=e.target.value.replace(/\D/g,""); if(v.length>2) v=v.slice(0,2)+"/"+v.slice(2); setCard({...card,expiry:v}); }}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
                <input placeholder="CVC" maxLength={4} value={card.cvc}
                  onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g,"") })}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-mono placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
              </div>
              <input placeholder={t("カード名義","Cardholder name")} value={card.name}
                onChange={(e) => setCard({ ...card, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
            </div>
            <button onClick={handlePay}
              disabled={!card.number || !card.expiry || !card.cvc || !card.name}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${card.number && card.expiry && card.cvc && card.name ? "bg-lemon text-text-primary hover:bg-lemon-hover" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {t("支払う","Pay")} ${amount.toFixed(2)}
            </button>
            <p className="text-center text-[11px] text-gray-400 mt-2 flex items-center justify-center gap-1">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="12" height="9" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/></svg>
              {t("Stripe によるセキュア決済","Secured by Stripe")}
            </p>
          </>)}

          {/* Step: processing */}
          {step === "processing" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <svg className="animate-spin w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
              <p className="text-sm text-gray-500">{t("処理中...","Processing...")}</p>
            </div>
          )}

          {/* Step: done */}
          {step === "done" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 9 17 20 6"/></svg>
              </div>
              <p className="text-sm font-semibold text-gray-900">{t("追加しました","Added")} ${amount.toFixed(2)}</p>
              <p className="text-xs text-gray-400">{t("残高に反映されました","Balance updated")}</p>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover transition-colors">{t("閉じる","Close")}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Buyer card ────────────────────────────────────────────────────────────────
const KYC_BADGE: Record<string, { cls: string; labelJa: string; labelEn: string }> = {
  NONE: { cls: "bg-gray-100 text-gray-500 border-gray-200",     labelJa: "未認証", labelEn: "Unverified" },
  KYA:  { cls: "bg-violet-50 text-violet-700 border-violet-200", labelJa: "KYA",   labelEn: "KYA" },
  KYC:  { cls: "bg-sky-50 text-sky-700 border-sky-200",          labelJa: "KYC",   labelEn: "KYC" },
};
function BuyerCard({ buyer, onFund }: { buyer: Buyer; onFund: () => void }) {
  const t = useT();
  const kyc = KYC_BADGE[buyer.kycTier] ?? KYC_BADGE.NONE;
  const balance = parseFloat(buyer.balanceUsdc);
  return (
    <div className={`bg-white border rounded-2xl overflow-hidden ${buyer.suspended ? "border-red-200 opacity-70" : "border-gray-200"}`}>
      {/* Balance row */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs text-gray-500">{t("利用可能残高", "Available Balance")}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold ${kyc.cls}`}>{t(kyc.labelJa, kyc.labelEn)}</span>
            {buyer.suspended && <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold bg-red-50 text-red-600 border-red-200">{t("停止中", "Suspended")}</span>}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-gray-900">{balance.toFixed(6)}</span>
            <span className="text-sm text-gray-500">USDC</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">{buyer.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onFund} className="px-5 py-2.5 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover transition-colors">
            {t("資金ウォレット", "Fund Wallet")}
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2.5 border border-gray-200 bg-white text-sm text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="6"/><polyline points="8 5 8 8 10 10"/>
            </svg>
            {t("活動", "Activity")}
          </button>
        </div>
      </div>

      {/* Tokens */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-900">{t("トークン", "Tokens")}</span>
          <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
            {t("すべて表示", "View all")}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h6M7 4l2 2-2 2"/></svg>
          </button>
        </div>
        <div className="border border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="14" cy="14" r="5"/>
            <circle cx="14" cy="14" r="10" strokeDasharray="3 3"/>
          </svg>
          <span className="text-sm">{t("有効なトークンはありません", "No active tokens")}</span>
        </div>
      </div>

      {/* Recent charges */}
      <div className="px-6 pt-0 pb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-900">{t("最近の告発", "Recent Charges")}</span>
          <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
            {t("すべて表示", "View all")}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 6h6M7 4l2 2-2 2"/></svg>
          </button>
        </div>
        <div className="border border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="20" height="14" rx="2"/>
            <path d="M4 13h20"/>
          </svg>
          <span className="text-sm">{t("料金はかかりません", "No charges")}</span>
        </div>
      </div>
    </div>
  );
}

// ── Buyers section (below onboarding) ────────────────────────────────────────
function BuyersSection({ buyers, onCreateBuyer, onAddFunds, loading }: {
  buyers: Buyer[];
  onCreateBuyer: (name: string, email: string) => Promise<void>;
  onAddFunds: (buyerId: string, amount: number) => Promise<void>;
  loading: boolean;
}) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [errMsg, setErrMsg]     = useState("");
  const [fundingBuyer, setFundingBuyer] = useState<Buyer | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true); setErrMsg("");
    // メールは名前から自動生成
    const autoEmail = `${newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}@agent.kyapay.io`;
    try {
      await onCreateBuyer(newName.trim(), autoEmail);
      setNewName(""); setCreating(false);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "作成に失敗しました");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Loading */}
      {loading && buyers.length === 0 && (
        <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
          {t("読み込み中...", "Loading...")}
        </div>
      )}

      {/* Existing buyer cards */}
      {buyers.map((b) => (
        <div key={b.id}>
          <p className="text-base font-bold text-gray-900 mb-3">{b.name}</p>
          <BuyerCard buyer={b} onFund={() => setFundingBuyer(b)} />
        </div>
      ))}

      {/* Create buyer form */}
      {creating ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if(e.key==="Escape") setCreating(false); }}
              placeholder={t("購入者名（例: Agent-001）", "Buyer name (e.g. Agent-001)")}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
          </div>
          {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} disabled={!newName.trim() || saving}
              className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${newName.trim() && !saving ? "bg-lemon text-text-primary hover:bg-lemon-hover" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {saving ? t("作成中...", "Creating...") : t("作成", "Create")}
            </button>
            <button onClick={() => { setCreating(false); setErrMsg(""); }} className="px-4 py-2.5 border border-gray-200 text-sm text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">{t("キャンセル", "Cancel")}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)}
          className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>
          {t("購入者を作成する", "Create Buyer")}
        </button>
      )}

      {/* Stripe fund modal */}
      {fundingBuyer && (
        <FundModal buyer={fundingBuyer} onClose={() => setFundingBuyer(null)}
          onSuccess={async (amount) => { await onAddFunds(fundingBuyer.id, amount); setFundingBuyer(null); }} />
      )}
    </div>
  );
}

function BuyerOverviewCard({ buyerToken, onNavigate, refreshKey }: { buyerToken: string; onNavigate: (p: Page) => void; refreshKey: number }) {
  const t = useT();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function fetchData(silent = false) {
    if (!buyerToken) return;
    if (!silent) setRefreshing(true);
    Promise.all([
      fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${buyerToken}` } })
        .then(r => r.ok ? r.json() : Promise.reject(r))
        .then((d: UserProfile) => setProfile(d)),
      fetch(`${API_URL}/api/tokens?limit=1`, { headers: { Authorization: `Bearer ${buyerToken}` } })
        .then(r => r.ok ? r.json() : Promise.reject(r))
        .then((d: { total: number }) => setTokenCount(d.total)),
    ])
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  useEffect(() => { fetchData(profile !== null); }, [buyerToken, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-32 mb-4"/>
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl"/>)}
      </div>
    </div>
  );

  const tier = profile.buyer?.kycTier ?? "NONE";
  const tierCfg: Record<string, { bg: string; text: string; labelJa: string; labelEn: string; descJa: string; descEn: string }> = {
    NONE: { bg: "bg-gray-100",    text: "text-gray-600",    labelJa: "未認証",  labelEn: "Unverified",  descJa: "エージェント未認証（上限 $10/日）",     descEn: "Agent unverified (limit $10/day)" },
    KYA:  { bg: "bg-violet-50",   text: "text-violet-700",  labelJa: "KYA",    labelEn: "KYA",         descJa: "エージェント認証済み（上限 $1,000/日）", descEn: "Agent verified (limit $1,000/day)" },
    KYC:  { bg: "bg-sky-50",      text: "text-sky-700",     labelJa: "KYC",    labelEn: "KYC",         descJa: "本人確認済み（上限 $50,000/日）",       descEn: "Identity verified (limit $50,000/day)" },
  };
  const tc = tierCfg[tier] ?? tierCfg.NONE;

  return (
    <div className="flex flex-col gap-4">
      {/* Welcome */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{t("ようこそ", "Welcome")}</p>
            <h2 className="text-lg font-bold text-gray-900">{profile.name}</h2>
            <p className="text-xs text-gray-500">{profile.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => fetchData(false)}
              disabled={refreshing}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
              title={t("残高を更新", "Refresh balance")}>
              <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <div className="text-right">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${tc.bg} ${tc.text}`}>{t(tc.labelJa, tc.labelEn)}</span>
              <p className="text-[10px] text-gray-400 mt-1">{t(tc.descJa, tc.descEn)}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("USDC 残高", "USDC Balance"),       value: profile.buyer ? parseFloat(profile.buyer.balanceUsdc).toFixed(4) : "—",  unit: "USDC", action: null },
            { label: t("発行済みトークン", "Issued Tokens"),  value: tokenCount !== null ? String(tokenCount) : "—",                          unit: t("件","items"),   action: () => onNavigate("transactions") },
            { label: "Buyer ID",         value: profile.buyer?.id ? profile.buyer.id.slice(0,10)+"…" : "—",              unit: "",     action: null },
          ].map(c => (
            <div key={c.label}
              onClick={c.action ?? undefined}
              className={`bg-gray-50 border border-gray-200 rounded-xl p-4 ${c.action ? "cursor-pointer hover:bg-gray-100 transition-colors" : ""}`}>
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-xl font-bold font-mono text-gray-900">{c.value}</p>
              {c.unit && <p className="text-xs text-gray-400 mt-0.5">{c.unit}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-gray-900 mb-4">{t("クイックアクション", "Quick Actions")}</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: t("トークンを発行する", "Issue Token"),  desc: t("サービスのPay Tokenを発行", "Issue a Pay Token for a service"),  page: "transactions" as Page,
              icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75}><rect x="1.5" y="6" width="17" height="8" rx="2"/><line x1="6" y1="8.5" x2="6" y2="11.5"/><line x1="10" y1="8.5" x2="10" y2="11.5"/><line x1="14" y1="8.5" x2="14" y2="11.5"/></svg> },
            { label: t("課金履歴を確認", "View Charges"),       desc: t("使用履歴と消費額を確認", "Check usage history and spend"),     page: "fraud" as Page,
              icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.75}><rect x="2" y="5" width="16" height="12" rx="1.5"/><path d="M2 9h16"/><circle cx="6" cy="13" r="1" fill="currentColor"/></svg> },
          ].map(a => (
            <button key={a.label} onClick={() => onNavigate(a.page)}
              className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left">
              <div className="w-9 h-9 rounded-xl bg-navy text-white flex items-center justify-center flex-shrink-0">{a.icon}</div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{a.label}</p>
                <p className="text-xs text-gray-500">{a.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomePage({ buyerToken, onNavigate, refreshKey }: { buyerToken: string; onNavigate: (p: Page) => void; refreshKey: number }) {
  return (
    <div className="flex flex-col gap-5">
      <BuyerOverviewCard buyerToken={buyerToken} onNavigate={onNavigate} refreshKey={refreshKey} />
    </div>
  );
}

// ── Token + Charge API types ──────────────────────────────────────────────────
interface PayToken {
  id: string; serviceId: string;
  limitUsdc: string; usedUsdc: string;
  buyerTag: string | null; expiresAt: string;
  revoked: boolean; createdAt: string;
}
interface Charge {
  chargeId: string; status: "PENDING" | "COMPLETED" | "FAILED";
  amountUsdc: string; idempotencyKey: string;
  txHash: string | null; createdAt: string;
  buyerId: string; serviceId: string; tokenId: string; riskScore: number;
}

interface ApprovedService { id: string; name: string; type: string; pricePerCallUsdc: string; providerName: string; }

function TokensPage({ buyerToken, onTokenIssued }: { buyerToken: string; onTokenIssued?: () => void }) {
  const t = useT();
  const [tokens,    setTokens]    = useState<PayToken[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  // ── 発行フォーム ──
  const [showForm,  setShowForm]  = useState(false);
  const [services,  setServices]  = useState<ApprovedService[]>([]);
  const [svcId,     setSvcId]     = useState("");
  const [limitAmt,  setLimitAmt]  = useState("1.00");
  const [buyerTag,  setBuyerTag]  = useState("");
  const [issuing,   setIssuing]   = useState(false);
  const [issued,    setIssued]    = useState<{ jwt: string; tokenId: string } | null>(null);
  const [issueErr,  setIssueErr]  = useState("");

  function loadTokens() {
    setLoading(true);
    fetch(`${API_URL}/api/tokens?limit=50`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: { data: PayToken[] }) => setTokens(data.data))
      .catch(() => setError(t("トークンの取得に失敗しました", "Failed to load tokens")))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTokens(); }, [buyerToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showForm) return;
    fetch(`${API_URL}/api/services?reviewStatus=APPROVED`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: ApprovedService[]) => { setServices(data); if (data[0]) setSvcId(data[0].id); })
      .catch(() => {});
  }, [showForm]);

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssuing(true); setIssueErr(""); setIssued(null);
    try {
      const res = await fetch(`${API_URL}/api/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyerToken}` },
        body: JSON.stringify({ serviceId: svcId, limitUsdc: limitAmt, buyerTag: buyerTag || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "発行に失敗しました");
      setIssued({ jwt: data.jwt, tokenId: data.tokenId });
      loadTokens();
      onTokenIssued?.();
    } catch (e: unknown) {
      setIssueErr(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setIssuing(false);
    }
  }

  function getStatus(t: PayToken): "active" | "revoked" | "expired" {
    if (t.revoked) return "revoked";
    if (new Date(t.expiresAt) < new Date()) return "expired";
    return "active";
  }

  const statusCfg = {
    active:  { cls: "bg-green-50 text-green-700 border-green-200",  label: t("有効", "Active") },
    revoked: { cls: "bg-red-50 text-red-700 border-red-200",        label: t("無効化", "Revoked") },
    expired: { cls: "bg-gray-100 text-gray-500 border-gray-200",    label: t("期限切れ", "Expired") },
  };

  const activeCount = tokens.filter((t) => getStatus(t) === "active").length;
  const totalUsed   = tokens.reduce((s, t) => s + parseFloat(t.usedUsdc), 0);

  // Map serviceId → name: DEMO_SERVICES fallback for display
  function svcName(serviceId: string) {
    return DEMO_SERVICES.find((s) => s.id === serviceId)?.name ?? serviceId;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("有効なトークン", "Active Tokens")}</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{activeCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("合計使用額", "Total Used")}</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{totalUsed.toFixed(6)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("発行総数", "Total Issued")}</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{tokens.length}</p>
        </div>
      </div>

      {/* 発行フォーム */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-gray-900">{t("新しいPay Tokenを発行", "Issue New Pay Token")}</h2>
            <button onClick={() => { setShowForm(false); setIssued(null); setIssueErr(""); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
          {issued ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                {t("発行完了", "Issued")}: {issued.tokenId.slice(0,16)}…
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">{t("Pay Token JWT（コピーして使用）", "Pay Token JWT (copy to use)")}</p>
                <div className="relative bg-gray-50 border border-gray-200 rounded-xl p-3 overflow-hidden">
                  <code className="text-[10px] font-mono text-gray-700 break-all leading-relaxed">{issued.jwt}</code>
                  <CopyButton text={issued.jwt} />
                </div>
              </div>
              <button onClick={() => { setIssued(null); setShowForm(false); }}
                className="self-end px-5 py-2 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover">
                {t("完了", "Done")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleIssue} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("サービス", "Service")}</label>
                <select value={svcId} onChange={e => setSvcId(e.target.value)} required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/20">
                  {services.length === 0
                    ? <option value="">{t("承認済みサービスを読み込み中…", "Loading approved services…")}</option>
                    : services.map(s => (
                      <option key={s.id} value={s.id}>{s.name} — {s.providerName} ({parseFloat(s.pricePerCallUsdc).toFixed(4)} USDC/call)</option>
                    ))
                  }
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("利用上限 (USDC)", "Limit (USDC)")}</label>
                  <input type="number" step="0.000001" min="0.000001" value={limitAmt}
                    onChange={e => setLimitAmt(e.target.value)} required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Buyer Tag <span className="text-gray-400 font-normal">{t("（任意）", "(optional)")}</span></label>
                  <input type="text" value={buyerTag} onChange={e => setBuyerTag(e.target.value)} placeholder="agent-001"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20" />
                </div>
              </div>
              {issueErr && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{issueErr}</div>}
              <div className="flex justify-end">
                <button type="submit" disabled={issuing || !svcId}
                  className="px-6 py-2.5 bg-lemon hover:bg-lemon-hover text-text-primary text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                  {issuing ? t("発行中…", "Issuing…") : t("トークンを発行する", "Issue Token")}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Token list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">{t("トークン一覧", "Token List")}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{tokens.length} {t("件","items")}</span>
            <button onClick={() => { setShowForm(true); setIssued(null); setIssueErr(""); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-lemon hover:bg-lemon-hover text-text-primary text-xs font-semibold rounded-xl transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              {t("トークンを発行", "Issue Token")}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
            {t("読み込み中...", "Loading...")}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm">{error}</div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400 text-sm">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="12" strokeDasharray="4 4"/></svg>
            {t("発行済みトークンはありません", "No issued tokens")}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-2.5 border-b border-gray-100 grid grid-cols-12 gap-2 bg-gray-50">
              {[t("トークンID","Token ID"),t("サービス","Service"),t("上限額","Limit"),t("使用済","Used"),"Buyer Tag",t("有効期限","Expires"),t("状態","Status")].map((h,i) => (
                <span key={i} className={`text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${i===1?"col-span-3":i===4?"col-span-2":i===5?"col-span-2":"col-span-1"}`}>{h}</span>
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {tokens.map((t) => {
                const status = getStatus(t);
                const cfg    = statusCfg[status];
                const limit  = parseFloat(t.limitUsdc);
                const used   = parseFloat(t.usedUsdc);
                const pct    = limit > 0 ? (used / limit) * 100 : 0;
                return (
                  <div key={t.id} className="px-6 py-3.5 grid grid-cols-12 gap-2 items-center hover:bg-gray-50 text-xs">
                    <span className="col-span-1 font-mono text-gray-500 text-[10px] truncate">{t.id.slice(0,10)}…</span>
                    <div className="col-span-3 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{svcName(t.serviceId)}</p>
                      <p className="text-[10px] text-gray-400 font-mono truncate">{t.serviceId}</p>
                    </div>
                    <span className="col-span-1 font-mono text-gray-700">{parseFloat(t.limitUsdc).toFixed(4)}</span>
                    <div className="col-span-1">
                      <p className="font-mono text-gray-700">{parseFloat(t.usedUsdc).toFixed(4)}</p>
                      <div className="w-full h-1 bg-gray-100 rounded-full mt-1">
                        <div className={`h-1 rounded-full ${pct > 80 ? "bg-red-400" : "bg-blue-400"}`} style={{ width: `${Math.min(pct,100)}%` }}/>
                      </div>
                    </div>
                    <span className="col-span-2 text-gray-400 font-mono text-[10px]">{t.buyerTag ?? "—"}</span>
                    <span className="col-span-2 text-gray-400 font-mono text-[10px]">{t.expiresAt.slice(0,10)}</span>
                    <span className="col-span-1">
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${cfg.cls}`}>{cfg.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChargesPage({ buyerToken }: { buyerToken: string }) {
  const t = useT();
  const [filter,   setFilter]   = useState<"all"|"COMPLETED"|"FAILED"|"PENDING">("all");
  const [charges,  setCharges]  = useState<Charge[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [total,    setTotal]    = useState(0);

  useEffect(() => {
    setLoading(true); setError("");
    const qs = filter === "all" ? "" : `&status=${filter}`;
    fetch(`${API_URL}/api/charges?limit=50${qs}`, {
      headers: { Authorization: `Bearer ${buyerToken}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: { data: Charge[]; total: number }) => { setCharges(data.data); setTotal(data.total); })
      .catch(() => setError(t("課金履歴の取得に失敗しました", "Failed to load charges")))
      .finally(() => setLoading(false));
  }, [filter, buyerToken]);

  const statusCfg: Record<string, { cls: string; label: string }> = {
    COMPLETED: { cls: "bg-green-50 text-green-700 border-green-200",  label: t("成功", "Success") },
    FAILED:    { cls: "bg-red-50 text-red-700 border-red-200",        label: t("失敗", "Failed") },
    PENDING:   { cls: "bg-amber-50 text-amber-700 border-amber-200",  label: t("保留", "Pending") },
  };

  const totalSpend = charges
    .filter((c) => c.status === "COMPLETED")
    .reduce((s, c) => s + parseFloat(c.amountUsdc), 0);
  const failCount = charges.filter((c) => c.status === "FAILED").length;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("合計支払い額", "Total Spend")}</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{totalSpend.toFixed(6)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USDC ({t("成功分","completed")})</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("総リクエスト数", "Total Requests")}</p>
          <p className="text-2xl font-bold font-mono text-gray-900">{total}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">{t("失敗", "Failed")}</p>
          <p className={`text-2xl font-bold font-mono ${failCount > 0 ? "text-red-600" : "text-gray-900"}`}>{failCount}</p>
        </div>
      </div>

      {/* Charges list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">{t("課金履歴", "Charges")}</h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(["all","COMPLETED","FAILED","PENDING"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${filter===f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {f==="all"?t("すべて","All"):f==="COMPLETED"?t("成功","Success"):f==="FAILED"?t("失敗","Failed"):t("保留","Pending")}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
            {t("読み込み中...", "Loading...")}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-red-500 text-sm">{error}</div>
        ) : charges.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400 text-sm">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="10" width="24" height="16" rx="2"/><path d="M4 16h24"/></svg>
            {t("課金履歴はありません", "No charges")}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-2.5 border-b border-gray-100 grid grid-cols-12 gap-2 bg-gray-50">
              {[t("日時","Date"),t("Buyer","Buyer"),t("Service","Service"),t("金額","Amount"),t("ステータス","Status"),t("トークンID","Token ID"),"TxHash"].map((h,i) => (
                <span key={i} className={`text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${i===0||i===1||i===2?"col-span-2":i===5?"col-span-2":"col-span-1"}`}>{h}</span>
              ))}
            </div>
            <div className="divide-y divide-gray-100">
              {charges.map((c) => {
                const scfg = statusCfg[c.status] ?? statusCfg.PENDING;
                return (
                  <div key={c.chargeId} className="px-6 py-3.5 grid grid-cols-12 gap-2 items-center hover:bg-gray-50 text-xs">
                    <span className="col-span-2 font-mono text-gray-400 text-[10px]">{new Date(c.createdAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="col-span-2 font-mono text-gray-500 text-[10px] truncate">{c.buyerId.slice(0,8)}…</span>
                    <span className="col-span-2 font-mono text-gray-500 text-[10px] truncate">{c.serviceId.slice(0,8)}…</span>
                    <span className="col-span-1 font-mono font-semibold text-gray-900">{parseFloat(c.amountUsdc).toFixed(5)}</span>
                    <span className="col-span-1">
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${scfg.cls}`}>{scfg.label}</span>
                    </span>
                    <span className="col-span-2 font-mono text-gray-400 text-[10px] truncate">{c.tokenId.slice(0,12)}…</span>
                    <span className="col-span-1 font-mono text-gray-400 text-[10px] truncate">{c.txHash ? c.txHash.slice(0,8)+"…" : "—"}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentsPage() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        {(["none", "kya", "kyc"] as const).map((tier) => {
          const c = TIER_CFG[tier];
          const count = DEMO_AGENTS.filter((a) => a.tier === tier).length;
          return (
            <div key={tier} className="panel rounded-xl p-4 flex items-center gap-3">
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${c.bg} ${c.text}`}>{c.label.slice(0, 1)}</span>
              <div>
                <p className="text-xs text-text-muted">{c.label} tier</p>
                <p className="text-2xl font-bold font-mono text-text-primary">{count}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel rounded-xl flex flex-col" style={{ height: "calc(100vh - 320px)", minHeight: 300 }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-text-primary">{t("エージェント一覧", "Agent List")}</span>
          <span className="text-xs text-text-muted">{DEMO_AGENTS.length} {t("件","items")}</span>
        </div>
        <div className="px-5 py-2 border-b border-border grid grid-cols-12 gap-2 flex-shrink-0 bg-canvas">
          {(["ID", "Tier", "Trust", t("成功率","Success%"), t("本日","Today"), t("上限","Limit"), t("状態","Status"), t("最終TX","Last TX")] as const).map((h) => (
            <span key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-text-muted ${h === "ID" || h === t("本日","Today") || h === t("上限","Limit") ? "col-span-2" : "col-span-1"}`}>{h}</span>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {DEMO_AGENTS.map((a) => (
            <div key={a.id} className="px-5 py-2.5 grid grid-cols-12 gap-2 items-center hover:bg-canvas text-xs">
              <span className="col-span-2 font-mono text-text-primary font-medium">{a.id}</span>
              <span className="col-span-1"><TierBadge tier={a.tier} /></span>
              <span className="col-span-1"><Risk score={a.trustScore} /></span>
              <span className="col-span-1 font-mono text-text-secondary">{a.successRate}%</span>
              <span className="col-span-2 font-mono text-text-secondary">${a.usedToday.toFixed(2)}</span>
              <span className="col-span-2 font-mono text-text-muted">${a.dailyLimit.toLocaleString()}</span>
              <span className="col-span-1">
                {a.suspended
                  ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">{t("停止","Halted")}</span>
                  : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">{t("稼働","Active")}</span>}
              </span>
              <span className="col-span-2 font-mono text-text-muted text-[10px]">{a.lastTx}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FraudPage({ blockedTx, avgRisk }: { blockedTx: number; avgRisk: number }) {
  const t = useT();
  const open = DEMO_FLAGS.filter((f) => !f.resolved);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label={t("未解決フラグ","Open Flags")} value={open.length} sub={t("要対応","Action required")} color={open.length > 0 ? "red" : "green"} />
        <KpiCard label={t("ブロック TX","Blocked TX")} value={blockedTx.toLocaleString()} unit={t("件","items")} sub={t("不正検知によりブロック","Blocked by fraud detection")} />
        <KpiCard label={t("平均リスクスコア","Avg Risk Score")} value={avgRisk.toFixed(1)} sub={t("直近100件の平均","Average of last 100")} />
      </div>
      <div className="panel rounded-xl flex flex-col" style={{ height: "calc(100vh - 360px)", minHeight: 260 }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-text-primary">{t("不正フラグ一覧","Fraud Flags")}</span>
          <span className="text-xs text-text-muted">{DEMO_FLAGS.length} {t("件","items")}</span>
        </div>
        <div className="px-5 py-2 border-b border-border grid grid-cols-12 gap-2 flex-shrink-0 bg-canvas">
          {(["ID", "Agent", t("シグナル","Signal"), "Risk", t("検出","Detected"), t("状態","Status")] as const).map((h) => (
            <span key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-text-muted ${h === t("シグナル","Signal") || h === t("検出","Detected") ? "col-span-3" : h === "ID" || h === "Agent" ? "col-span-2" : "col-span-1"}`}>{h}</span>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {DEMO_FLAGS.map((f) => (
            <div key={f.id} className="px-5 py-2.5 grid grid-cols-12 gap-2 items-center hover:bg-canvas text-xs">
              <span className="col-span-2 font-mono text-text-muted">{f.id}</span>
              <span className="col-span-2 font-mono text-accent-blue">{f.agentId}</span>
              <span className="col-span-3 text-text-secondary">{f.signal.replace(/_/g, " ")}</span>
              <span className="col-span-1"><Risk score={f.riskScore} /></span>
              <span className="col-span-3 text-text-muted text-[10px]">{f.createdAt}</span>
              <span className="col-span-1">
                {f.resolved
                  ? <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">{t("解決済","Resolved")}</span>
                  : <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200 animate-pulse">{t("未対応","Pending")}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── USDC Deposit Page ────────────────────────────────────────────────────────

type DepositCurrency = "usd" | "jpy" | "eur" | "gbp";

interface BankDetails {
  type:           "zengin" | "aba" | "iban" | "sort_code" | null;
  accountNumber?: string; bankName?: string; branchCode?: string;
  routingNumber?: string; accountType?: string;
  iban?: string; bic?: string; sortCode?: string;
}

const CURRENCY_META: Record<DepositCurrency, {
  symbol: string; label: string; min: number; step: number;
  presets: number[]; toUsdc: (amt: number, rate: number) => number;
}> = {
  usd: { symbol: "$",  label: "USD", min: 1,   step: 1,    presets: [5, 10, 25, 50],            toUsdc: (a) => a },
  jpy: { symbol: "¥",  label: "JPY", min: 500, step: 100,  presets: [1000, 3000, 5000, 10000],   toUsdc: (a, r) => a / r },
  eur: { symbol: "€",  label: "EUR", min: 1,   step: 1,    presets: [5, 10, 25, 50],            toUsdc: (a) => a * 1.08 },
  gbp: { symbol: "£",  label: "GBP", min: 1,   step: 1,    presets: [5, 10, 20, 50],            toUsdc: (a) => a * 1.27 },
};

function USDCDepositPage({ buyerToken }: { buyerToken: string }) {
  const t   = useT();
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${buyerToken}` };

  type USDCTab = "card" | "bank" | "onchain";
  const [tab,      setTab]      = useState<USDCTab>("card");
  const [currency, setCurrency] = useState<DepositCurrency>("usd");

  // ── Profile ──────────────────────────────────────────────────
  const [buyerName,     setBuyerName]     = useState("");
  const [buyerEmail,    setBuyerEmail]    = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  // ── Card ─────────────────────────────────────────────────────
  const [jpycRate,    setJpycRate]    = useState(150);
  const [cardAmount,  setCardAmount]  = useState("10");
  const [cardLoading, setCardLoading] = useState(false);
  const [cardErr,     setCardErr]     = useState("");

  // ── Bank ─────────────────────────────────────────────────────
  // key = currency, value = fetched bank details
  const [bankDetailsMap, setBankDetailsMap] = useState<Partial<Record<DepositCurrency, BankDetails | null>>>({});
  const [bankLoading, setBankLoading] = useState(false);
  const [bankErr,     setBankErr]     = useState("");
  const [bankRetry,   setBankRetry]   = useState(0); // increment to retry

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdrs })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d: UserProfile) => { setBuyerName(d.name); setBuyerEmail(d.email); })
      .catch(() => {})
      .finally(() => setProfileLoaded(true));
    fetch(`${API}/api/jpyc/info`).then(r => r.json())
      .then((d: JpycInfo) => setJpycRate(d.jpycRate ?? 150))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function friendlyBankError(msg: string): string {
    if (/401|unauthorized|認証/i.test(msg))
      return t("セッションが切れました。再ログインしてください。", "Session expired. Please log in again.");
    if (/network|fetch|ECONNREFUSED/i.test(msg))
      return t("ネットワークエラーが発生しました。接続を確認して再試行してください。", "Network error. Please check your connection and retry.");
    if (/500|internal/i.test(msg))
      return t("サーバーエラーが発生しました。しばらくしてから再試行してください。", "Server error. Please try again later.");
    if (/stripe/i.test(msg))
      return t("Stripe との通信でエラーが発生しました。しばらくしてから再試行してください。", "Error communicating with Stripe. Please try again later.");
    return msg || t("予期しないエラーが発生しました。", "An unexpected error occurred.");
  }

  // fetch bank details when tab=bank, currency changes, or retry triggered
  useEffect(() => {
    if (tab !== "bank") return;
    if (!profileLoaded) return;
    if (!buyerEmail) {
      setBankErr(t("アカウント情報を取得できませんでした。再ログインしてください。", "Could not load account info. Please log in again."));
      return;
    }
    if (bankDetailsMap[currency] !== undefined && bankRetry === 0) return; // already fetched
    setBankLoading(true); setBankErr("");
    fetch(`${API}/api/stripe/bank-transfer`, {
      method: "POST", headers: hdrs,
      body: JSON.stringify({ email: buyerEmail, name: buyerName, currency }),
    })
      .then(async r => {
        const d = await r.json() as { bankDetails?: BankDetails; error?: string };
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        if (d.error) throw new Error(d.error);
        setBankDetailsMap(prev => ({ ...prev, [currency]: d.bankDetails ?? null }));
      })
      .catch((e: Error) => setBankErr(friendlyBankError(e.message)))
      .finally(() => setBankLoading(false));
  }, [tab, currency, profileLoaded, buyerEmail, bankRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCardCheckout(e: React.FormEvent) {
    e.preventDefault();
    const meta = CURRENCY_META[currency];
    const amt  = parseFloat(cardAmount);
    if (!amt || amt < meta.min) { setCardErr(`Minimum ${meta.symbol}${meta.min}`); return; }
    setCardLoading(true); setCardErr("");
    try {
      const origin = window.location.origin;
      const res = await fetch(`${API}/api/stripe/card-checkout`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ amount: amt, currency, successUrl: `${origin}/?charge=success`, cancelUrl: `${origin}/?charge=cancel` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("エラーが発生しました", "An error occurred"));
      window.location.href = data.url;
    } catch (err: unknown) {
      setCardErr(err instanceof Error ? err.message : t("エラーが発生しました", "An error occurred"));
      setCardLoading(false);
    }
  }

  const meta = CURRENCY_META[currency];

  // render bank detail rows based on type
  function renderBankDetails(d: BankDetails) {
    const rows: { label: string; value: string }[] = [];
    if (d.bankName)      rows.push({ label: t("銀行名", "Bank"),              value: d.bankName });
    if (d.branchCode)    rows.push({ label: t("支店コード", "Branch Code"),    value: d.branchCode });
    if (d.routingNumber) rows.push({ label: t("ルーティング番号", "Routing No."), value: d.routingNumber });
    if (d.accountNumber) rows.push({ label: t("口座番号", "Account No."),       value: d.accountNumber });
    if (d.accountType)   rows.push({ label: t("口座種別", "Account Type"),      value: d.accountType });
    if (d.iban)          rows.push({ label: "IBAN",                              value: d.iban });
    if (d.bic)           rows.push({ label: "BIC / SWIFT",                       value: d.bic });
    if (d.sortCode)      rows.push({ label: t("ソートコード", "Sort Code"),      value: d.sortCode });
    return rows;
  }

  const usdcPreview = !isNaN(parseFloat(cardAmount)) && parseFloat(cardAmount) >= meta.min
    ? meta.toUsdc(parseFloat(cardAmount), jpycRate).toFixed(4)
    : null;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{t("USDCチャージ", "USDC Deposit")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("残高に USDC を追加します。", "Add USDC to your balance.")}</p>
      </div>

      {/* Currency selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-400">{t("通貨", "Currency")}:</span>
        <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
          {(["usd", "jpy", "eur", "gbp"] as DepositCurrency[]).map(c => (
            <button key={c} onClick={() => { setCurrency(c); setCardAmount(String(CURRENCY_META[c].presets[1])); }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all uppercase ${currency === c ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {CURRENCY_META[c].symbol} {CURRENCY_META[c].label}
            </button>
          ))}
        </div>
      </div>

      {/* Method tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1 w-fit">
        {([
          { id: "card"    as USDCTab, label: t("💳 カード", "💳 Card") },
          { id: "bank"    as USDCTab, label: t("🏦 銀行振込", "🏦 Bank Transfer") },
          { id: "onchain" as USDCTab, label: t("🔗 オンチェーン", "🔗 On-chain") },
        ]).map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Card ── */}
      {tab === "card" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-900 mb-1">{t("クレジット／デビットカード", "Credit / Debit Card")}</p>
          <p className="text-xs text-gray-500 mb-5">
            {t("Stripe の安全なページで決済。完了後すぐに USDC 残高に反映されます。", "Pay securely via Stripe. USDC balance is credited immediately after payment.")}
          </p>
          <form onSubmit={handleCardCheckout} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {t("入金金額", "Amount")} ({meta.label})
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">{meta.symbol}</span>
                <input type="number" value={cardAmount} onChange={e => setCardAmount(e.target.value)}
                  min={meta.min} step={meta.step}
                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  required />
              </div>
              {usdcPreview && (
                <p className="text-[10px] text-gray-400 mt-1">
                  ≈ {usdcPreview} USDC
                  {currency === "usd" && <span className="ml-1 text-emerald-500">{t("(1:1)", "(1:1)")}</span>}
                </p>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {meta.presets.map(v => (
                  <button key={v} type="button" onClick={() => setCardAmount(String(v))}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-50 transition-colors">
                    {meta.symbol}{v.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            {cardErr && <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{cardErr}</div>}
            <button type="submit" disabled={cardLoading}
              className="w-full py-2.5 bg-lemon hover:bg-lemon-hover text-text-primary text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {cardLoading ? t("リダイレクト中…", "Redirecting…") : <>💳 {t("Stripe で決済する", "Pay with Stripe")}</>}
            </button>
            <p className="text-[10px] text-gray-400 text-center">{t("Stripe の安全な決済ページへ遷移します", "You will be redirected to Stripe's secure payment page")}</p>
          </form>
        </div>
      )}

      {/* ── Bank Transfer ── */}
      {tab === "bank" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-900 mb-1">{t("銀行振込", "Bank Transfer")}</p>
          <p className="text-xs text-gray-500 mb-5">
            {t("下記の口座に振込すると、Stripe が自動検知して USDC 残高に反映します。", "Transfer to the account below. Stripe detects it automatically and credits your USDC balance.")}
          </p>
          {bankLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              {t("口座情報を取得中…", "Fetching account info…")}
            </div>
          )}
          {bankErr && (
            <div className="flex flex-col gap-3 items-start bg-red-50 border border-red-200 rounded-xl px-4 py-4">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd"/>
                </svg>
                <p className="text-sm text-red-700">{bankErr}</p>
              </div>
              <button
                onClick={() => { setBankErr(""); setBankDetailsMap(prev => { const n = { ...prev }; delete n[currency]; return n; }); setBankRetry(r => r + 1); }}
                className="text-xs font-medium text-red-600 hover:text-red-800 underline underline-offset-2"
              >
                {t("再試行する", "Retry")}
              </button>
            </div>
          )}
          {!bankLoading && !bankErr && (() => {
            const d = bankDetailsMap[currency];
            if (d === undefined) return null;
            if (d === null) return (
              <div className="flex flex-col gap-3 items-start bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-sm text-amber-700">{t("この通貨の振込口座を取得できませんでした。別の通貨を試すか、カード決済をご利用ください。", "Could not retrieve bank account for this currency. Try another currency or use card payment.")}</p>
                </div>
                <button
                  onClick={() => { setBankDetailsMap(prev => { const n = { ...prev }; delete n[currency]; return n; }); setBankRetry(r => r + 1); }}
                  className="text-xs font-medium text-amber-600 hover:text-amber-800 underline underline-offset-2"
                >
                  {t("再試行する", "Retry")}
                </button>
              </div>
            );
            const rows = renderBankDetails(d);
            return (
              <div className="flex flex-col gap-3">
                {rows.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                      <p className="text-sm font-mono font-semibold text-gray-800 break-all">{value}</p>
                    </div>
                    <CopyButton text={value} />
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 mt-1">
                  {t("※ 振込後、反映まで数分〜数時間かかる場合があります。", "※ It may take a few minutes to hours after transfer to reflect in your balance.")}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── On-chain ── */}
      {tab === "onchain" && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center gap-4 text-center py-12">
          <div className="w-12 h-12 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
            <IconUSDC cls="w-6 h-6 text-violet-500" />
          </div>
          <p className="font-semibold text-gray-700">{t("準備中", "Coming soon")}</p>
          <p className="text-sm text-gray-400 max-w-xs">
            {t("Polygon ウォレットから直接 USDC を送金できる入金アドレスを近日公開予定です。", "A Polygon deposit address is coming soon.")}
          </p>
        </div>
      )}
    </div>
  );
}

// ── JPYC Deposit Page (real API) ─────────────────────────────────────────────

interface JpycDepositReq {
  id: string; buyerId: string; txHash: string;
  amountJpyc: string; amountUsdc: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null; reviewedAt: string | null; createdAt: string;
}

interface JpycInfo { platformWallet: string; jpycRate: number; network: string; }

// レートは /api/jpyc/info から取得（CoinGecko経由）

function JPYCDepositPage({ buyerToken }: { buyerToken: string }) {
  const t = useT();
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${buyerToken}` };

  const [info,       setInfo]       = useState<JpycInfo | null>(null);
  const [requests,   setRequests]   = useState<JpycDepositReq[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [txHash,     setTxHash]     = useState("");
  const [amountJpyc, setAmountJpyc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitOk,   setSubmitOk]   = useState(false);
  const [submitErr,  setSubmitErr]  = useState("");


  function load() {
    setLoading(true);
    Promise.all([
      fetch(`${API}/api/jpyc/info`).then(r => r.json()),
      fetch(`${API}/api/jpyc/deposits?limit=50`, { headers: hdrs }).then(r => r.json()),
    ]).then(([inf, dep]) => {
      setInfo(inf as JpycInfo);
      setRequests((dep as { data: JpycDepositReq[] }).data ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!txHash.trim() || !amountJpyc.trim()) return;
    setSubmitting(true); setSubmitErr(""); setSubmitOk(false);
    try {
      const res = await fetch(`${API}/api/jpyc/deposits`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ txHash: txHash.trim(), amountJpyc: amountJpyc.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "申請に失敗しました");
      setSubmitOk(true);
      setTxHash(""); setAmountJpyc("");
      load();
    } catch (err: unknown) {
      setSubmitErr(err instanceof Error ? err.message : "申請に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const statusBadge = (s: "PENDING" | "APPROVED" | "REJECTED"): React.ReactElement => {
    if (s === "PENDING")  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">{t("審査中","Under Review")}</span>;
    if (s === "APPROVED") return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 border border-green-200 text-green-700">{t("承認済み","Approved")}</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 border border-red-200 text-red-700">{t("却下","Rejected")}</span>;
  };

  if (loading) return <div className="text-sm text-text-muted p-8 text-center">{t("読み込み中…","Loading…")}</div>;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <>

      {/* Platform wallet info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-1">{t("JPYCチャージの手順","JPYC Deposit Instructions")}</p>
        <p className="text-xs text-gray-500 mb-4">
          {t("以下のウォレットアドレスにJPYCを送金し、TXハッシュを入力してください。オンチェーンで自動検証され、即座にUSDC残高に反映されます。","Send JPYC to the wallet address below, then enter your TX hash. It will be verified on-chain automatically and your USDC balance will be updated instantly.")}
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] text-gray-400 mb-1">{t("送金先ウォレット","Destination Wallet")}（{info?.network ?? "Polygon"}）</p>
            <p className="text-sm font-mono text-gray-800 break-all">{info?.platformWallet ?? "—"}</p>
          </div>
          {info && <CopyButton text={info.platformWallet} />}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span>{t("換算レート","Rate")}: <span className="font-semibold text-gray-700">{info?.jpycRate ?? 150} JPYC = 1 USDC</span></span>
          <span>{t("ネットワーク","Network")}: <span className="font-semibold text-violet-600">{info?.network ?? "Polygon"}</span></span>
        </div>
      </div>

      {/* Submit form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">{t("チャージ申請","Deposit Request")}</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("TXハッシュ","TX Hash")}</label>
            <input
              type="text" value={txHash} onChange={e => setTxHash(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-mono text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("送金したJPYC金額","JPYC Amount Sent")}</label>
            <input
              type="number" value={amountJpyc} onChange={e => setAmountJpyc(e.target.value)}
              placeholder={t("例: 15000","e.g. 15000")}
              min="1" step="1"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
              required
            />
            {amountJpyc && !isNaN(parseFloat(amountJpyc)) && (
              <p className="text-[10px] text-gray-400 mt-1">
                {t("換算後","Converted")}: ≈ {(parseFloat(amountJpyc) / (info?.jpycRate ?? 150)).toFixed(4)} USDC
              </p>
            )}
          </div>
          {submitErr && <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{submitErr}</div>}
          {submitOk  && <div className="px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">✅ {t("オンチェーン検証完了。USDC残高に即座に反映されました。","On-chain verification complete. Your USDC balance has been updated instantly.")}</div>}
          <button type="submit" disabled={submitting}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
            {submitting ? t("申請中…","Submitting…") : t("チャージを申請する","Submit Deposit Request")}
          </button>
        </form>
      </div>

      {/* Request history */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">{t("申請履歴","Request History")}</span>
          <button onClick={load} className="text-xs text-gray-500 hover:text-gray-700">{t("更新","Refresh")}</button>
        </div>
        {requests.length === 0
          ? <div className="px-5 py-8 text-center text-sm text-gray-400">{t("申請履歴がありません","No requests")}</div>
          : (
            <div className="divide-y divide-gray-100">
              {requests.map(r => (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-gray-500 text-[10px] truncate">{r.txHash}</p>
                    <p className="text-gray-700 mt-0.5">
                      <span className="font-semibold">{parseFloat(r.amountJpyc).toLocaleString()} JPYC</span>
                      {r.amountUsdc && <span className="text-gray-400 ml-1">→ {parseFloat(r.amountUsdc).toFixed(4)} USDC</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {statusBadge(r.status)}
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(r.createdAt).toLocaleDateString("ja-JP")}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </div>

      </>
    </div>
  );
}

// ── API Keys page ─────────────────────────────────────────────────────────────
interface ApiKeyEntry {
  id: string; key: string; label: string; createdAt: string; revoked: boolean;
}

function ApiKeysPage({ keys, onAdd, onRevoke }: {
  keys: ApiKeyEntry[];
  onAdd: () => void;
  onRevoke: (id: string) => void;
}) {
  const t = useT();
  const [showRevoked, setShowRevoked] = useState(false);
  const visible = showRevoked ? keys : keys.filter((k) => !k.revoked);

  return (
    <div className="flex flex-col gap-5">
      {/* Page heading row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
            <circle cx="7.5" cy="10" r="4"/><path d="M10.5 10h8M16 8v4"/>
          </svg>
          <h1 className="text-xl font-bold text-gray-900">{t("APIキー","API Keys")}</h1>
        </div>
        <button
          onClick={onAdd}
          className="px-5 py-2.5 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover transition-colors"
        >
          {t("APIキーを作成する","Create API Key")}
        </button>
      </div>

      {/* Show revoked toggle */}
      <button
        onClick={() => setShowRevoked((v) => !v)}
        className="self-start flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showRevoked ? "bg-navy border-navy" : "border-gray-300"}`}>
          {showRevoked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 5 4 7.5 8.5 2.5"/></svg>}
        </span>
        {t("無効化されたAPIキーを表示する","Show revoked API keys")}
      </button>

      {/* Keys list */}
      <div className="flex flex-col gap-2">
        {visible.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl px-6 py-10 text-center text-sm text-gray-400">
            {t("APIキーがありません。Playgroundで作成してください。","No API keys. Create one in the Playground.")}
          </div>
        ) : (
          visible.map((k) => (
            <div key={k.id} className={`bg-white border rounded-2xl px-6 py-4 flex items-center gap-4 ${k.revoked ? "border-gray-100 opacity-50" : "border-gray-200"}`}>
              <span className="font-mono text-sm text-gray-700 flex-1 truncate">
                {"•".repeat(28)} {k.key.slice(-4)}
              </span>
              <span className="text-sm text-gray-500 flex-shrink-0">{k.label}</span>
              <span className="text-sm text-gray-400 flex-shrink-0">{t("作成日","Created")}: {k.createdAt}</span>
              <button className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2l3 3-9 9H2v-3L11 2z"/>
                </svg>
              </button>
              {!k.revoked ? (
                <button
                  onClick={() => onRevoke(k.id)}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
                >
                  {t("無効化","Revoke")}
                </button>
              ) : (
                <span className="px-3 py-1.5 bg-gray-100 text-gray-400 text-xs font-semibold rounded-lg flex-shrink-0">{t("無効化済","Revoked")}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Playground (Token creation wizard) ───────────────────────────────────────
interface ApiService {
  id: string; providerId: string; providerName: string;
  name: string; type: "API" | "MCP";
  pricePerCallUsdc: string; reviewStatus: string;
  verified: boolean; createdAt: string; updatedAt: string;
}

function PlaygroundPage({ buyers, onKeyCreated }: { buyers: Buyer[]; onKeyCreated: (key: string) => void }) {
  const [step,      setStep]      = useState<0 | 1 | 2>(0);
  const [buyerId,   setBuyerId]   = useState("");
  const [serviceId, setServiceId] = useState("");
  const [limitUsdc, setLimitUsdc] = useState("1.0");
  const [buyerTag,  setBuyerTag]  = useState("");
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [submitting, setSubmitting] = useState(false);
  const [errMsg,     setErrMsg]     = useState("");
  const [result,     setResult]     = useState<{ tokenId: string; jwt: string; limitUsdc: string; expiresAt: string } | null>(null);
  const [apiServices, setApiServices] = useState<ApiService[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/services?reviewStatus=APPROVED&limit=100`)
      .then((r) => r.json())
      .then((data: ApiService[]) => setApiServices(Array.isArray(data) ? data : []))
      .catch(() => setApiServices([]));
  }, []);

  async function handleIssue() {
    if (!buyerId || !serviceId || !limitUsdc) return;
    setSubmitting(true); setErrMsg("");
    try {
      const res = await fetch(`${API_URL}/api/tokens`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerId,
          serviceId,
          limitUsdc,
          buyerTag:  buyerTag || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const msg = typeof err?.error === "string"   ? err.error
                  : typeof err?.message === "string" ? err.message
                  : err?.error?.issues?.[0]?.message  // Zod バリデーションエラー
                  ?? `HTTP ${res.status}: 発行に失敗しました`;
        throw new Error(msg);
      }
      const data = await res.json();
      setResult({ tokenId: data.tokenId, jwt: data.jwt, limitUsdc: data.limitUsdc, expiresAt: data.expiresAt });
      onKeyCreated(data.jwt);
      setStep(2);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "発行に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldCls = "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-gray-400";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page heading */}
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="text-gray-900">
          <path d="M10 2l1.8 5.5H17l-4.6 3.4 1.8 5.5L10 13l-4.2 3.4 1.8-5.5L3 7.5h5.2z"/>
        </svg>
        <h1 className="text-xl font-bold text-gray-900">トークン作成プレイグラウンド</h1>
      </div>

      {/* ── Step 0: intro ── */}
      {step === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8">
          <div className="flex items-start gap-2.5 mb-4">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-gray-500 mt-0.5 flex-shrink-0">
              <circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.5" fill="currentColor"/>
            </svg>
            <h2 className="text-lg font-bold text-gray-900">LEMON cakeトークンとは何ですか？</h2>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed mb-8">
            トークンとは、購入者が作成する、本人確認情報と紐づいた決済トークンです。トークンには金銭残高と本人確認情報が含まれており、購入者と販売者の間でデジタルリソースへのアクセスを目的とした、自動化された安全な取引を可能にします。販売者はこれらのトークンを検証し、プログラムによって決済を請求できます。
          </p>
          <div className="flex justify-end">
            <button onClick={() => setStep(1)}
              className="px-6 py-3 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover transition-colors">
              さあ、始めましょう
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: issue token ── */}
      {step === 1 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Pay Token を発行する</h2>
            <p className="text-sm text-gray-500">購入者とサービスを指定してJWT形式のPay Tokenを発行します。</p>
          </div>

          {/* Buyer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700">購入者 <span className="text-red-500">*</span></label>
            {buyers.length === 0 ? (
              <p className="text-xs text-gray-400 italic">購入者が登録されていません。先にホームから購入者を作成してください。</p>
            ) : (
              <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}
                className={fieldCls + " bg-white"}>
                <option value="">購入者を選択…</option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({parseFloat(b.balanceUsdc).toFixed(4)} USDC)</option>
                ))}
              </select>
            )}
          </div>

          {/* Service */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700">サービス <span className="text-red-500">*</span></label>
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}
              className={fieldCls + " bg-white"}>
              <option value="">サービスを選択…</option>
              {apiServices.length > 0
                ? apiServices.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.providerName}) — ${parseFloat(s.pricePerCallUsdc).toFixed(4)}/call</option>
                  ))
                : DEMO_SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — ${s.price.toFixed(4)}/call</option>
                  ))
              }
            </select>
            <p className="text-[10px] text-gray-400">
              {apiServices.length > 0
                ? `${apiServices.length}件のAPPROVEDサービスを表示中`
                : "APPROVEDサービスがありません。先にサービスを登録・審査してください。"}
            </p>
          </div>

          {/* Limit */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700">上限額 (USDC) <span className="text-red-500">*</span></label>
            <input type="number" min="0.000001" step="0.1" value={limitUsdc}
              onChange={(e) => setLimitUsdc(e.target.value)}
              placeholder="例: 5.0"
              className={fieldCls} />
          </div>

          {/* Buyer Tag (optional) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700">Buyer Tag <span className="text-gray-400 font-normal">（任意）</span></label>
            <input type="text" value={buyerTag} onChange={(e) => setBuyerTag(e.target.value)}
              placeholder="例: agent-001"
              className={fieldCls} />
          </div>

          {/* Expiry */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-700">有効期限 <span className="text-gray-400 font-normal">（未設定で30日後）</span></label>
            <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className={fieldCls} />
          </div>

          {errMsg && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{errMsg}</div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(0)}
              className="px-5 py-2.5 border border-gray-200 bg-white text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
              戻る
            </button>
            <button
              onClick={handleIssue}
              disabled={submitting || !buyerId || !serviceId || !limitUsdc}
              className={`px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
                !submitting && buyerId && serviceId && limitUsdc
                  ? "bg-lemon text-text-primary hover:bg-lemon-hover"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}>
              {submitting ? "発行中…" : "トークンを発行する"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: success ── */}
      {step === 2 && result && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600"><polyline points="2 8 6 12 14 4"/></svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">トークンが発行されました！</h2>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <div className="flex gap-3">
              <span className="text-gray-400 w-24 flex-shrink-0">Token ID</span>
              <span className="font-mono text-gray-700 break-all">{result.tokenId}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gray-400 w-24 flex-shrink-0">上限額</span>
              <span className="font-mono text-gray-700">{result.limitUsdc} USDC</span>
            </div>
            <div className="flex gap-3">
              <span className="text-gray-400 w-24 flex-shrink-0">有効期限</span>
              <span className="font-mono text-gray-700">{new Date(result.expiresAt).toLocaleString("ja-JP")}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">JWT（Pay Token）</p>
            <div className="bg-gray-950 rounded-xl p-4 relative">
              <pre className="text-xs font-mono text-green-400 break-all whitespace-pre-wrap">{result.jwt}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(result.jwt)}
                className="absolute top-3 right-3 px-2 py-1 bg-navy hover:bg-navy-light text-white text-[10px] rounded-md transition-colors">
                コピー
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">このJWTはAPIキー一覧に保存されました。エージェントの Authorization: Bearer ヘッダーに使用してください。</p>
          </div>

          <div className="flex justify-end">
            <button onClick={() => { setStep(1); setResult(null); setErrMsg(""); }}
              className="px-5 py-2.5 bg-lemon text-text-primary text-sm font-semibold rounded-xl hover:bg-lemon-hover transition-colors">
              別のトークンを発行する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Directory ─────────────────────────────────────────────────────────────────
function CurlSnippet({ service, tokenType, apiKey, buyerTag, expiry }: {
  service: Service; tokenType: string; apiKey: string; buyerTag: string; expiry: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const masked = apiKey ? apiKey : "YOUR_API_KEY";
  const tag    = buyerTag || "buyer_tag_here";
  const exp    = expiry   || "2026-12-31T23:59:59Z";
  const code   =
`curl -X POST https://api.kyapay.io/v1/charge \\
  -H "Authorization: Bearer ${masked}" \\
  -H "Content-Type: application/json" \\
  -H "X-KYAPay-Token-Type: ${tokenType || "kya"}" \\
  -H "X-Buyer-Tag: ${tag}" \\
  -d '{
    "service_id": "${service.id}",
    "amount": ${service.price},
    "currency": "USDC",
    "expires_at": "${exp}",
    "metadata": {
      "provider": "${service.provider}",
      "service": "${service.name}"
    }
  }'`;

  function copy() {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  // Simple manual syntax highlight
  const highlighted = code
    .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="text-green-400">$1</span>')
    .replace(/\b(curl|Bearer)\b/g, '<span class="text-blue-400">$1</span>')
    .replace(/(-X|-H|-d|\\)/g, '<span class="text-yellow-400">$1</span>')
    .replace(/\b(POST|GET)\b/g, '<span class="text-orange-400">$1</span>');

  return (
    <div className="relative bg-gray-950 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-mono">cURL</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
          {copied ? (
            <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="1 6 4 9 11 2"/></svg> {t("コピー済","Copied")}</>
          ) : (
            <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="4" width="7" height="7" rx="1"/><path d="M1 8V1h7"/></svg> {t("コピー","Copy")}</>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlighted }} />
    </div>
  );
}

function ServiceDetail({ service, onBack }: { service: Service; onBack: () => void }) {
  const t = useT();
  const [tokenType, setTokenType] = useState(service.tokenTypes[0] ?? "kya");
  const [apiKey,    setApiKey]    = useState("");
  const [buyerTag,  setBuyerTag]  = useState("");
  const [expiry,    setExpiry]    = useState("2026-12-31T23:59:59Z");

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Back */}
      <button onClick={onBack} className="self-start flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
        {t("ディレクトリに戻る","Back to Directory")}
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${service.type === "MCP" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{service.type}</span>
              <span className="text-xs text-gray-400">{service.provider}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{service.name}</h1>
            <p className="text-sm text-gray-600 leading-relaxed">{service.description}</p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {service.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-500 text-[11px] rounded-md">{t}</span>
              ))}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400 mb-0.5">{t("1回あたり","Per call")}</p>
            <p className="text-2xl font-bold font-mono text-gray-900">${service.price.toFixed(4)}</p>
            <p className="text-xs text-gray-400">USDC</p>
          </div>
        </div>
      </div>

      {/* Info table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">{t("サービス情報","Service Info")}</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {[
              [t("サービスID","Service ID"),         <span className="font-mono text-gray-700">{service.id}</span>],
              [t("最低トークン額","Min Token Amount"), <span className="font-mono">${(service.minTokenAmount ?? service.price).toFixed(4)} USDC</span>],
              [t("対応トークンタイプ","Token Types"),  <div className="flex gap-1.5">{service.tokenTypes.map((tt) => <span key={tt} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] rounded font-mono">{tt}</span>)}</div>],
              ["OpenAPI",                              <a href={service.apiSpecUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{service.apiSpecUrl}</a>],
              [t("利用規約","Terms of Service"),       service.tosUrl ? <a href={service.tosUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{service.tosUrl}</a> : <span className="text-gray-400">—</span>],
            ].map(([label, value], i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-3.5 w-44 text-gray-500 font-medium">{label as string}</td>
                <td className="px-6 py-3.5 text-gray-800">{value as React.ReactNode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Token creation + cURL */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">{t("トークン作成例","Token Creation Example")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t("左のフォームを入力するとcURLが動的に更新されます","Fill in the form to dynamically update the cURL snippet")}</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          {/* Form */}
          <div className="p-6 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("トークンタイプ","Token Type")}</label>
              <div className="flex gap-2">
                {service.tokenTypes.map((t) => (
                  <button key={t} onClick={() => setTokenType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${tokenType === t ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("APIキー","API Key")}</label>
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="kya_xxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-mono placeholder-gray-300 focus:outline-none focus:border-gray-400"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("購入者タグ","Buyer Tag")}</label>
              <input value={buyerTag} onChange={(e) => setBuyerTag(e.target.value)} placeholder="buyer_001"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-mono placeholder-gray-300 focus:outline-none focus:border-gray-400"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("有効期限 (ISO 8601)","Expiry (ISO 8601)")}</label>
              <input value={expiry} onChange={(e) => setExpiry(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:border-gray-400"/>
            </div>
          </div>
          {/* cURL */}
          <div className="p-6">
            <CurlSnippet service={service} tokenType={tokenType} apiKey={apiKey} buyerTag={buyerTag} expiry={expiry} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service: s, onSelect }: { service: Service; onSelect: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  function copyUrl(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(s.apiSpecUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div onClick={onSelect}
      className="bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${s.type === "MCP" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{s.type}</span>
            <span className="text-xs text-gray-400 truncate">{s.provider}</span>
          </div>
          <p className="text-sm font-bold text-gray-900 truncate">{s.name}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400">{t("1回","Per call")}</p>
          <p className="text-sm font-bold font-mono text-gray-900">${s.price.toFixed(4)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{s.description}</p>
      <div className="flex flex-wrap gap-1">
        {s.tags.slice(0, 4).map((t) => <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">{t}</span>)}
      </div>
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <span className="text-[10px] text-gray-400 font-mono truncate flex-1">{s.apiSpecUrl}</span>
        <button onClick={copyUrl}
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0 px-2 py-1 rounded border border-gray-200 hover:border-gray-400">
          {copied ? t("✓ コピー済","✓ Copied") : <><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="4" width="7" height="7" rx="1"/><path d="M1 8V1h7"/></svg> {t("コピー","Copy")}</>}
        </button>
      </div>
    </div>
  );
}

function apiServiceToService(s: ApiService): Service {
  return {
    id:             s.id,
    name:           s.name,
    provider:       s.providerName,
    type:           s.type,
    price:          parseFloat(s.pricePerCallUsdc) || 0,
    description:    "",
    tags:           [],
    apiSpecUrl:     "",
    tokenTypes:     ["kyapay"],
    minTokenAmount: parseFloat(s.pricePerCallUsdc) || 0,
  };
}

function DirectoryPage() {
  const t = useT();
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState<"all" | "API" | "MCP">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [services,   setServices]   = useState<Service[]>(DEMO_SERVICES);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/services?reviewStatus=APPROVED&limit=100`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: ApiService[]) => {
        if (Array.isArray(data) && data.length > 0) setServices(data.map(apiServiceToService));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selected = services.find((s) => s.id === selectedId);

  if (selected) return <ServiceDetail service={selected} onBack={() => setSelectedId(null)} />;

  const filtered = services.filter((s) => {
    const matchType = filter === "all" || s.type === filter;
    const q = search.toLowerCase();
    const matchQ = !q || s.name.toLowerCase().includes(q) || s.provider.toLowerCase().includes(q) || s.tags.some((tag) => tag.includes(q)) || s.description.toLowerCase().includes(q);
    return matchType && matchQ;
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3"/>
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("サービス名・プロバイダー・タグで検索","Search by name, provider, or tag")}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:border-gray-400"/>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {(["all", "API", "MCP"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {f === "all" ? t("全種類","All") : f}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400">
        {loading ? t("読み込み中…","Loading…") : `${filtered.length} ${t("件のサービス","services")}`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl py-16 flex flex-col items-center gap-2 text-gray-400">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="14" cy="14" r="9"/><path d="M23 23l6 6"/></svg>
          <p className="text-sm">{t("一致するサービスが見つかりませんでした","No matching services found")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((s) => (
            <ServiceCard key={s.id} service={s} onSelect={() => setSelectedId(s.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function KillSwitchPage({ isHalted, loading, onToggle }: { isHalted: boolean; loading: boolean; onToggle: () => void }) {
  return (
    <div className="panel rounded-xl p-8 flex flex-col items-center gap-6 max-w-md mx-auto mt-4">
      <div className="text-center">
        <p className="text-base font-semibold text-text-primary">緊急停止コントロール</p>
        <p className="text-xs text-text-muted mt-1">全エージェント間送金を即時停止・再開します</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${isHalted ? "bg-red-500" : "bg-green-500 status-live"}`} />
        <span className={`text-sm font-semibold ${isHalted ? "text-red-600" : "text-green-600"}`}>
          {isHalted ? "SYSTEM HALTED — 全送金停止中" : "OPERATIONAL — 正常稼働中"}
        </span>
      </div>
      <button
        onClick={onToggle}
        disabled={loading}
        className={`w-36 h-36 rounded-full font-bold flex flex-col items-center justify-center gap-2 border-2 transition-all disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-offset-2 ${
          isHalted
            ? "bg-green-50 border-green-500 text-green-600 hover:bg-green-100 focus:ring-green-200"
            : "bg-red-50  border-red-500  text-red-600  hover:bg-red-100  focus:ring-red-200"
        }`}
      >
        {loading ? <span className="text-2xl animate-spin">⟳</span>
          : isHalted ? <><span className="text-3xl">▶</span><span className="text-[11px] font-bold tracking-widest">RESUME</span></>
          : <><span className="text-3xl">⏹</span><span className="text-[11px] font-bold tracking-widest leading-tight text-center">EMERGENCY<br/>HALT</span></>}
      </button>
      <p className="text-xs text-text-muted text-center max-w-xs">
        {isHalted ? "全エージェント間の送金が停止されています。再開するには ▶ を押してください。" : "このボタンを押すと全エージェント間の送金が即時ブロックされます。"}
      </p>
    </div>
  );
}

// ── Seller Onboarding Modal ───────────────────────────────────────────────────
function SellerOnboardingModal({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center"
        style={{ animation: "sellerModalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div className="flex justify-center mb-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center">
            <span className="text-5xl">🚀</span>
          </div>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-3">{t("ようこそ、出品者様！","Welcome, Seller!")}</h2>
        <p className="text-sm text-gray-500 leading-relaxed mb-7">
          {t("これで Skyfire の販売者として登録が完了しました。最初のサービスを作成し、インタラクティブなプレイグラウンドでサービスの料金設定方法を学びましょう。",
             "You are now registered as a Skyfire seller. Create your first service and learn how to set pricing in the interactive playground.")}
        </p>
        <div className="flex flex-col gap-2.5">
          <button onClick={onStart}
            className="w-full py-3 bg-lemon hover:bg-lemon-hover text-text-primary font-semibold rounded-xl transition-colors text-sm">
            {t("プロフィールを作成する","Create Profile")}
          </button>
          <button onClick={onClose}
            className="w-full py-3 text-gray-500 hover:text-gray-700 font-medium rounded-xl transition-colors text-sm hover:bg-gray-50">
            {t("今はスキップ","Skip for now")}
          </button>
        </div>
      </div>
      <style>{`@keyframes sellerModalIn{from{opacity:0;transform:scale(0.88) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}

// ── Seller types ─────────────────────────────────────────────────────────────
type SellerServiceType = "API" | "WebPage" | "MCPLocal" | "MCPRemote" | "FetchAI";
type SellerPriceModel  = "per_use" | "subscription" | "tiered";
type SellerKycLevel    = "none" | "kya" | "kyc";

interface SellerProfile {
  storeName: string;
  bio: string;
  websiteUrl: string;
  contactEmail: string;
  category: "AI/ML" | "データ" | "DevTools" | "ファイナンス" | "その他";
  walletAddress: string;   // ← 追加
  providerId: string;      // ← 追加（API登録後に設定）
}
const SELLER_PROFILE_INITIAL: SellerProfile = {
  storeName: "", bio: "", websiteUrl: "", contactEmail: "", category: "AI/ML",
  walletAddress: "", providerId: "",   // ← 追加
};

interface MyServiceEntry {
  id: string;
  name: string;
  description: string;
  serviceType: SellerServiceType;
  priceModel: SellerPriceModel;
  price: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}
interface SellerFormData {
  name: string; description: string; serviceType: SellerServiceType;
  endpointUrl: string; openApiUrl: string; priceModel: SellerPriceModel;
  price: string; minTokenAmount: string; maxTokenTtl: string;
  tokenTypes: string[]; tosUrl: string;
  requiredKyc: SellerKycLevel; allowedRegions: string[]; maxDailyBudget: string;
}
const SELLER_INITIAL: SellerFormData = {
  name: "", description: "", serviceType: "API",
  endpointUrl: "", openApiUrl: "", priceModel: "per_use",
  price: "", minTokenAmount: "", maxTokenTtl: "86400",
  tokenTypes: ["kyapay"], tosUrl: "",
  requiredKyc: "none", allowedRegions: [], maxDailyBudget: "",
};

const SELLER_STEPS_JA = ["サービス情報", "サービスの詳細", "本人確認要件", "レビュー"];
const SELLER_STEPS_EN = ["Service Info", "Service Details", "KYC Requirements", "Review"];

// ── フォームUI共通パーツ（モジュールスコープ — 再レンダーで再生成されない）──
const FInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={`w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all ${props.className ?? ""}`} />
);
const FTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...props} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 transition-all resize-none" />
);
const FLabel = ({ children, req }: { children: React.ReactNode; req?: boolean }) => (
  <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}{req && <span className="text-red-400 ml-1">*</span>}</label>
);

function SellerWizardPanel({
  onClose, onSubmitted, sellerProviderId,
}: {
  onClose: () => void;
  onSubmitted?: (entry: MyServiceEntry) => void;
  sellerProviderId: string;
}) {
  const t = useT();
  const SELLER_STEPS = SELLER_STEPS_JA.map((ja, i) => t(ja, SELLER_STEPS_EN[i]));
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SellerFormData>(SELLER_INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const patch = (p: Partial<SellerFormData>) => setData(prev => ({ ...prev, ...p }));

  const canNext = step === 0 ? data.name.trim().length > 0
                : step === 1 ? data.price.trim().length > 0 && data.tokenTypes.length > 0
                : true;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = localStorage.getItem("buyer_token");
      if (!token || !sellerProviderId) {
        throw new Error("プロフィールのウォレット登録が必要です");
      }
      const res = await fetch(`${API_URL}/api/services/seller`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          name: data.name,
          type: data.serviceType === "MCPLocal" || data.serviceType === "MCPRemote" ? "MCP" : "API",
          pricePerCallUsdc: data.price || "0.001",
          endpoint: data.endpointUrl || undefined,
          description: data.description,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Error ${res.status}`);
      }
      const service = await res.json();
      setSubmitted(true);
      const entry: MyServiceEntry = {
        id: service.id,
        name: service.name,
        description: data.description,
        serviceType: data.serviceType,
        priceModel: data.priceModel,
        price: data.price,
        status: "pending",
        createdAt: new Date().toLocaleDateString("ja-JP"),
      };
      onSubmitted?.(entry);
    } catch (e: any) {
      alert(e.message ?? "サービス登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 0 コンテンツ（インラインJSX）──
  const step0Content = (
    <div className="space-y-5">
      <div><FLabel req>{t("サービス名","Service Name")}</FLabel>
        <FInput placeholder={t("例: GPT-4o Inference API","e.g. GPT-4o Inference API")} value={data.name} onChange={e => patch({ name: e.target.value })} />
      </div>
      <div><FLabel>{t("説明","Description")}</FLabel>
        <FTextarea rows={3} placeholder={t("サービスの機能・ユースケースを記述してください。","Describe the features and use cases of your service.")} value={data.description} onChange={e => patch({ description: e.target.value })} />
      </div>
      <div><FLabel req>{t("サービスの種類","Service Type")}</FLabel>
        <div className="space-y-2 mt-1">
          {([
            { v: "API",       label: "API",                                desc: "REST / GraphQL など HTTP API" },
            { v: "WebPage",   label: t("ウェブページ","Web Page"),          desc: t("ブラウザ自動化対応のWebページ","Browser-automation-compatible web page") },
            { v: "MCPLocal",  label: t("MCPサーバー（ローカル）","MCP Server (Local)"),  desc: t("ローカル環境で動作する MCP サーバー","MCP server running in local environment") },
            { v: "MCPRemote", label: t("MCPサーバー（リモート）","MCP Server (Remote)"), desc: t("クラウド上で動作する MCP サーバー","MCP server running in the cloud") },
            { v: "FetchAI",   label: "Fetch.ai " + t("エージェント","Agent"),            desc: "uAgents " + t("フレームワーク対応","framework compatible") },
          ] as { v: SellerServiceType; label: string; desc: string }[]).map(stype => (
            <label key={stype.v} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${data.serviceType === stype.v ? "border-gray-800 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" name="stype" value={stype.v} checked={data.serviceType === stype.v} onChange={() => patch({ serviceType: stype.v })} className="mt-0.5" />
              <div><div className="text-sm font-medium text-gray-800">{stype.label}</div><div className="text-xs text-gray-500">{stype.desc}</div></div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Step 1 コンテンツ（インラインJSX）──
  const tokenTypeOpts = [
    { v: "kyapay", label: t("KYAPay トークン","KYAPay Token"), badge: "bg-blue-100 text-blue-700" },
    { v: "kya",    label: t("KYA トークン","KYA Token"),       badge: "bg-emerald-100 text-emerald-700" },
    { v: "pay",    label: t("PAY トークン","PAY Token"),        badge: "bg-violet-100 text-violet-700" },
  ];
  const toggleToken = (v: string) => patch({ tokenTypes: data.tokenTypes.includes(v) ? data.tokenTypes.filter(t => t !== v) : [...data.tokenTypes, v] });
  const step1Content = (
    <div className="space-y-5">
      <div><FLabel>{t("エンドポイントURL","Endpoint URL")}</FLabel>
        <FInput placeholder="https://api.yourservice.com/v1" type="url" value={data.endpointUrl} onChange={e => patch({ endpointUrl: e.target.value })} />
      </div>
      <div><FLabel>OpenAPI {t("仕様 URL","Spec URL")}</FLabel>
        <FInput placeholder="https://api.yourservice.com/openapi.json" type="url" value={data.openApiUrl} onChange={e => patch({ openApiUrl: e.target.value })} />
      </div>
      <div><FLabel req>{t("価格モデル","Pricing Model")}</FLabel>
        <select value={data.priceModel} onChange={e => patch({ priceModel: e.target.value as SellerPriceModel })}
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
          <option value="per_use">{t("使用ごとに（従量課金）","Per use (pay-as-you-go)")}</option>
          <option value="subscription">{t("サブスクリプション（月額固定）","Subscription (monthly)")}</option>
          <option value="tiered">{t("段階的価格","Tiered pricing")}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FLabel req>{t("価格（USDC / コール）","Price (USDC / call)")}</FLabel>
          <div className="relative"><FInput placeholder="0.005" type="number" min="0" step="0.0001" value={data.price} onChange={e => patch({ price: e.target.value })} className="pr-16" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">USDC</span></div>
        </div>
        <div><FLabel>{t("最低トークン額","Min Token Amount")}</FLabel>
          <div className="relative"><FInput placeholder="0.01" type="number" min="0" value={data.minTokenAmount} onChange={e => patch({ minTokenAmount: e.target.value })} className="pr-16" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">USDC</span></div>
        </div>
      </div>
      <div><FLabel>{t("トークン最大有効期間（秒）","Max Token TTL (seconds)")}</FLabel>
        <FInput type="number" min="60" value={data.maxTokenTtl} onChange={e => patch({ maxTokenTtl: e.target.value })} />
        <p className="text-xs text-gray-400 mt-1">{t("デフォルト: 86400秒（24時間）","Default: 86400 seconds (24 hours)")}</p>
      </div>
      <div><FLabel req>{t("受け入れるトークンタイプ","Accepted Token Types")}</FLabel>
        <div className="space-y-2">
          {tokenTypeOpts.map(t => (
            <label key={t.v} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${data.tokenTypes.includes(t.v) ? "border-gray-800 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="checkbox" checked={data.tokenTypes.includes(t.v)} onChange={() => toggleToken(t.v)} className="accent-gray-900" />
              <span className="text-sm font-medium text-gray-800">{t.label}</span>
              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase ${t.badge}`}>{t.v}</span>
            </label>
          ))}
        </div>
      </div>
      <div><FLabel>{t("利用規約URL（ToS）","Terms of Service URL (ToS)")}</FLabel>
        <FInput placeholder="https://yourservice.com/terms" type="url" value={data.tosUrl} onChange={e => patch({ tosUrl: e.target.value })} />
      </div>
    </div>
  );

  // ── Step 2 コンテンツ（インラインJSX）──
  const kycLevels: { v: SellerKycLevel; label: string; badge: string; desc: string }[] = [
    { v: "none", label: t("認証不要","No Verification"),          badge: "bg-gray-100 text-gray-600",       desc: t("誰でも利用可能。","Open to everyone.") },
    { v: "kya",  label: "KYA（Know Your Agent）",                  badge: "bg-emerald-100 text-emerald-700", desc: t("エージェント認証済みの利用者のみ。","Agent-verified users only.") },
    { v: "kyc",  label: t("KYC（本人確認済み）","KYC (Identity Verified)"), badge: "bg-blue-100 text-blue-700", desc: t("フル本人確認が完了した利用者のみ。","Full identity verification required.") },
  ];
  const regionOpts = [{ v: "JP", l: t("日本","Japan") },{ v: "US", l: t("アメリカ","USA") },{ v: "EU", l: "EU" },{ v: "SG", l: t("シンガポール","Singapore") },{ v: "GLOBAL", l: t("全世界","Global") }];
  const toggleRegion = (v: string) => patch({ allowedRegions: data.allowedRegions.includes(v) ? data.allowedRegions.filter(r => r !== v) : [...data.allowedRegions, v] });
  const step2Content = (
    <div className="space-y-5">
      <div><FLabel req>{t("必要な認証レベル","Required Verification Level")}</FLabel>
        <div className="space-y-2">
          {kycLevels.map(l => (
            <label key={l.v} className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${data.requiredKyc === l.v ? "border-gray-800 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
              <input type="radio" name="kyc" value={l.v} checked={data.requiredKyc === l.v} onChange={() => patch({ requiredKyc: l.v })} className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-800">{l.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase ${l.badge}`}>{l.v === "none" ? "OPEN" : l.v.toUpperCase()}</span>
                </div>
                <p className="text-xs text-gray-500">{l.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div><FLabel>{t("利用可能地域","Available Regions")}</FLabel>
        <div className="flex flex-wrap gap-2">
          {regionOpts.map(r => (
            <button key={r.v} type="button" onClick={() => toggleRegion(r.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${data.allowedRegions.includes(r.v) ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
              {r.l}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-xs"><FLabel>{t("1日あたり予算上限（USDC）","Daily Budget Limit (USDC)")}</FLabel>
        <div className="relative"><FInput placeholder="100" type="number" min="0" value={data.maxDailyBudget} onChange={e => patch({ maxDailyBudget: e.target.value })} className="pr-16" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">USDC</span></div>
      </div>
    </div>
  );

  // ── Step 3 コンテンツ（インラインJSX）──
  const typeLabels: Record<SellerServiceType, string> = { API:"API", WebPage:t("ウェブページ","Web Page"), MCPLocal:t("MCPサーバー（ローカル）","MCP Server (Local)"), MCPRemote:t("MCPサーバー（リモート）","MCP Server (Remote)"), FetchAI:"Fetch.ai " + t("エージェント","Agent") };
  const kycLabels: Record<SellerKycLevel, string> = { none:t("認証不要","No Verification"), kya:"KYA（Know Your Agent）", kyc:t("KYC（本人確認済み）","KYC (Identity Verified)") };
  const ReviewRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 text-right flex-1 break-all">{value || "—"}</span>
    </div>
  );
  const step3Content = (
    <div className="space-y-5">
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("基本情報","Basic Info")}</p>
        <ReviewRow label={t("サービス名","Service Name")} value={data.name} />
        <ReviewRow label={t("説明","Description")} value={data.description} />
        <ReviewRow label={t("種類","Type")} value={typeLabels[data.serviceType]} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("詳細設定","Details")}</p>
        <ReviewRow label={t("エンドポイント","Endpoint")} value={data.endpointUrl} />
        <ReviewRow label={t("価格","Price")} value={data.price ? `${data.price} USDC / ${t("コール","call")}` : ""} />
        <ReviewRow label={t("トークンタイプ","Token Types")} value={data.tokenTypes.map(tt => tt.toUpperCase()).join(" / ")} />
        <ReviewRow label={t("トークン有効期間","Token TTL")} value={data.maxTokenTtl ? `${data.maxTokenTtl} ${t("秒","sec")}` : ""} />
      </div>
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("本人確認要件","KYC Requirements")}</p>
        <ReviewRow label={t("認証レベル","Verification Level")} value={kycLabels[data.requiredKyc]} />
        <ReviewRow label={t("利用可能地域","Allowed Regions")} value={data.allowedRegions.length ? data.allowedRegions.join("、") : t("全世界","Global")} />
      </div>
      <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
        <span className="text-base shrink-0">⚠️</span>
        <p className="text-xs text-amber-800">{t("登録後、運営チームによる審査（1〜3営業日）が行われます。承認後にマーケットプレイスに公開されます。","After submission, the operations team will review your listing (1–3 business days). It will be published upon approval.")}</p>
      </div>
    </div>
  );

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-10 text-center max-w-sm mx-4">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-7 h-7 text-green-600">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">{t("申請が完了しました！","Submission complete!")}</h2>
          <p className="text-sm text-gray-500 mb-5">「{data.name}」{t("の審査を開始しました。","is now under review.")}</p>
          <button onClick={onClose} className="w-full py-2.5 bg-lemon hover:bg-lemon-hover text-text-primary font-semibold rounded-xl text-sm transition-colors">{t("閉じる","Close")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex" style={{ animation: "wizardSlideIn 0.3s ease-out" }}>
      {/* 背景クリックで閉じる */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* ウィザードパネル */}
      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t("サービスを作成","Create Service")}</h2>
            <p className="text-xs text-gray-400">{t("ステップ","Step")} {step + 1} / {SELLER_STEPS.length}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
            </svg>
          </button>
        </div>
        {/* ステッパー */}
        <div className="px-6 py-3 border-b border-gray-100 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {SELLER_STEPS.map((label, i) => {
              const done = step > i; const active = step === i; const last = i === SELLER_STEPS.length - 1;
              return (
                <div key={i} className="flex items-center">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${done ? "bg-navy text-white" : active ? "bg-lemon text-text-primary ring-4 ring-lemon-muted" : "bg-gray-200 text-gray-500"}`}>
                      {done ? <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-3 h-3"><path d="M2 5l2 2L8 3" strokeLinecap="round" strokeLinejoin="round"/></svg> : i + 1}
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap ${active ? "text-text-primary font-semibold" : done ? "text-gray-600" : "text-gray-400"}`}>{label}</span>
                  </div>
                  {!last && <div className={`h-px w-6 mx-2 ${done ? "bg-navy" : "bg-gray-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>
        {/* フォーム本体 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && step0Content}
          {step === 1 && step1Content}
          {step === 2 && step2Content}
          {step === 3 && step3Content}
        </div>
        {/* フッター */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
              <path d="M9 11L5 7l4-4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t("戻る","Back")}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${canNext ? "bg-lemon hover:bg-lemon-hover text-text-primary" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
              {t("次へ","Next")}
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M5 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-lemon hover:bg-lemon-hover text-text-primary transition-all disabled:opacity-60">
              {submitting ? (<><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" opacity="0.3"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>{t("登録中...","Submitting...")}</>) : t("サービスを登録する","Register Service")}
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes wizardSlideIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

// ── Seller Profile Panel ─────────────────────────────────────────────────────
function SellerProfilePanel({
  initial, onClose, onSave,
}: {
  initial: SellerProfile;
  onClose: () => void;
  onSave: (p: SellerProfile) => void;
}) {
  const t = useT();
  const [d, setD] = useState<SellerProfile>(initial);
  const patch = (p: Partial<SellerProfile>) => setD(prev => ({ ...prev, ...p }));
  const canSave = d.storeName.trim().length > 0 && d.contactEmail.trim().length > 0 && /^0x[a-fA-F0-9]{40}$/.test(d.walletAddress);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = localStorage.getItem("buyer_token");
      if (!token) throw new Error("ログインが必要です");
      const res = await fetch(`${API_URL}/api/providers/me`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          name: d.storeName,
          email: d.contactEmail,
          walletAddress: d.walletAddress,
          bio: d.bio,
          websiteUrl: d.websiteUrl,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Error ${res.status}`);
      }
      const provider = await res.json();
      onSave({ ...d, providerId: provider.id });
    } catch (e: any) {
      setSaveError(e.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ animation: "wizardSlideIn 0.3s ease-out" }}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t("販売者プロフィール","Seller Profile")}</h2>
            <p className="text-xs text-gray-400">{t("マーケットプレイスに表示されるあなたの情報","Your information displayed on the marketplace")}</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
            </svg>
          </button>
        </div>
        {/* フォーム */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* アバター仮置き */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-2xl font-bold text-gray-400 select-none">
              {d.storeName ? d.storeName[0].toUpperCase() : "?"}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{d.storeName || t("ストア名未設定","Store name not set")}</p>
              <p className="text-xs text-gray-400 mt-0.5">{t("プロフィール画像のアップロードは審査後に対応予定","Profile image upload available after review")}</p>
            </div>
          </div>

          <div>
            <FLabel req>{t("ストア名 / 事業者名","Store Name / Business Name")}</FLabel>
            <FInput placeholder={t("例: OpenWeather Inc.","e.g. OpenWeather Inc.")} value={d.storeName} onChange={e => patch({ storeName: e.target.value })} />
          </div>
          <div>
            <FLabel>{t("自己紹介・説明","Bio / Description")}</FLabel>
            <FTextarea rows={3} placeholder={t("あなたのサービスや会社について教えてください。","Tell us about your service or company.")} value={d.bio} onChange={e => patch({ bio: e.target.value })} />
          </div>
          <div>
            <FLabel req>{t("連絡先メールアドレス","Contact Email")}</FLabel>
            <FInput type="email" placeholder="contact@yourcompany.com" value={d.contactEmail} onChange={e => patch({ contactEmail: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">{t("審査連絡・通知の受け取りに使用します。公開はされません。","Used for review notifications. Not publicly displayed.")}</p>
          </div>
          <div>
            <FLabel>{t("ウェブサイトURL","Website URL")}</FLabel>
            <FInput type="url" placeholder="https://yourcompany.com" value={d.websiteUrl} onChange={e => patch({ websiteUrl: e.target.value })} />
          </div>
          <div>
            <FLabel req>{t("カテゴリ","Category")}</FLabel>
            <select value={d.category} onChange={e => patch({ category: e.target.value as SellerProfile["category"] })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
              {(["AI/ML","データ","DevTools","ファイナンス","その他"] as SellerProfile["category"][]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <FLabel req>{t("受取ウォレットアドレス (Polygon USDC)","Payout Wallet Address (Polygon USDC)")}</FLabel>
            <FInput
              placeholder="0xAbCd1234..."
              value={d.walletAddress}
              onChange={e => patch({ walletAddress: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">
              {t("サービス利用料の受け取りに使用するPolygon上のウォレットアドレスです。","Polygon wallet address to receive service fees.")}
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-base shrink-0">ℹ️</span>
            <p className="text-xs text-blue-800">{t("プロフィールを保存後、サービスの登録・管理ができるようになります。プロフィール情報は後から編集可能です。","After saving your profile, you can register and manage services. Profile info can be edited later.")}</p>
          </div>
        </div>
        {/* フッター */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2 shrink-0">
          {saveError && (
            <p className="text-xs text-red-600 text-right">{saveError}</p>
          )}
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
                <path d="M9 11L5 7l4-4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t("キャンセル","Cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-lemon hover:bg-lemon-hover disabled:bg-gray-200 disabled:text-gray-400 text-text-primary text-sm font-semibold rounded-xl transition-colors"
            >
              {saving ? (
                <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" opacity="0.3"/><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>{t("保存中...","Saving...")}</>
              ) : (
                <>{t("保存してマイサービスへ","Save & Go to My Services")}<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path d="M3 7h8M7 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/></svg></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── My Services Panel ─────────────────────────────────────────────────────────
// ── セラーページ: プロフィール未設定時の誘導 ──────────────────

interface ServiceStatsItem {
  serviceId:    string;
  serviceName:  string;
  providerName: string;
  chargeCount:  number;
  totalUsdc:    string;
  lastChargedAt: string | null;
}

function SellerStatsPage({ services }: { services: MyServiceEntry[] }) {
  const t = useT();
  const [statsMap, setStatsMap] = useState<Map<string, ServiceStatsItem>>(new Map());
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    fetch(`${API_URL}/api/services/stats`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((items: ServiceStatsItem[]) => {
        setStatsMap(new Map(items.map(i => [i.serviceId, i])));
      })
      .catch(() => {/* サイレントフォールバック */})
      .finally(() => setLoading(false));
  }, []);

  const rows = services.map(s => {
    const api = statsMap.get(s.id);
    return {
      ...s,
      chargeCount: api?.chargeCount ?? 0,
      totalUsdc:   api?.totalUsdc   ?? "0.0000",
      lastCharged: api?.lastChargedAt
        ? new Date(api.lastChargedAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })
        : "—",
    };
  });
  const totalCharges = rows.reduce((a, r) => a + r.chargeCount, 0);
  const totalUsdc    = rows.reduce((a, r) => a + parseFloat(r.totalUsdc), 0).toFixed(4);

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-sm text-gray-400 gap-2">
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      {t("統計データを読み込み中…","Loading statistics…")}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("サービス数","Services"),       value: services.length.toString(), sub: t("掲載中","listed") },
          { label: t("累計課金回数","Total Charges"), value: totalCharges.toLocaleString(), sub: "charges" },
          { label: t("累計収益","Total Revenue"),     value: `${totalUsdc} USDC`, sub: "earned" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* サービス別テーブル */}
      {services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <IconChart cls="w-10 h-10 text-gray-300" />
          <p className="text-sm text-gray-500">{t("サービスを登録すると統計が表示されます","Statistics will appear once you register a service")}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("サービス名","Service Name")}</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("タイプ","Type")}</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("単価","Unit Price")}</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("課金回数","Charges")}</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("収益 (USDC)","Revenue (USDC)")}</th>
                <th className="text-right px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t("最終課金","Last Charge")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? "bg-gray-50/30" : ""}`}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-gray-900 truncate max-w-[160px]">{r.name}</p>
                    <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      r.status === "approved" ? "bg-green-50 text-green-700 border-green-200"
                      : r.status === "rejected" ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>{r.status === "approved" ? t("公開中","Published") : r.status === "rejected" ? t("却下","Rejected") : t("審査中","Under Review")}</span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500">{r.serviceType}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-700">${r.price}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-gray-900">{r.chargeCount.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-gray-900">{r.totalUsdc}</td>
                  <td className="px-5 py-3.5 text-right text-gray-500 text-xs">{r.lastCharged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SellerSetupPrompt({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
        <IconStore cls="w-8 h-8 text-gray-400" />
      </div>
      <div>
        <p className="text-base font-bold text-gray-900 mb-1">{t("販売者プロフィールを作成する","Create Seller Profile")}</p>
        <p className="text-sm text-gray-500 max-w-xs">{t("サービスをマーケットプレイスに掲載するには、まず販売者プロフィールを作成してください。","Create a seller profile to list your services on the marketplace.")}</p>
      </div>
      <button
        onClick={onStart}
        className="px-5 py-2.5 bg-lemon hover:bg-lemon-hover text-text-primary text-sm font-semibold rounded-xl transition-colors"
      >
        {t("プロフィールを作成する","Create Profile")}
      </button>
    </div>
  );
}

// ── セラーページ: マイサービス（インライン） ──────────────────
function SellerServicesPage({
  profile, services, onEditProfile, onCreateService,
}: {
  profile: SellerProfile;
  services: MyServiceEntry[];
  onEditProfile: () => void;
  onCreateService: () => void;
}) {
  const t = useT();
  const statusCfg: Record<MyServiceEntry["status"], { label: string; cls: string }> = {
    pending:  { label: t("審査中","Under Review"), cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: t("公開中","Published"),    cls: "bg-green-50 text-green-700 border-green-200" },
    rejected: { label: t("却下","Rejected"),       cls: "bg-red-50 text-red-600 border-red-200" },
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* プロフィールカード */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-navy flex items-center justify-center text-white text-lg font-bold shrink-0">
          {profile.storeName[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900">{profile.storeName}</p>
          <p className="text-xs text-gray-500 truncate">{profile.bio}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{profile.category} · {profile.contactEmail}</p>
        </div>
        <button onClick={onEditProfile}
          className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600">
          {t("編集","Edit")}
        </button>
      </div>

      {/* サービス一覧 */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">{t("登録サービス","Registered Services")} <span className="text-gray-400 font-normal text-xs ml-1">{services.length}{t("件","")}</span></span>
          <button onClick={onCreateService}
            className="px-3 py-1.5 bg-lemon hover:bg-lemon-hover text-text-primary text-xs font-semibold rounded-lg transition-colors">
            + {t("サービスを追加","Add Service")}
          </button>
        </div>
        {services.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            <p>{t("まだサービスが登録されていません","No services registered yet")}</p>
            <button onClick={onCreateService} className="mt-3 text-gray-600 font-semibold hover:text-gray-900 underline text-xs">
              {t("最初のサービスを作成する","Create your first service")}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {services.map((s, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-500 truncate">{s.description}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.serviceType} · {s.price} / {s.priceModel}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusCfg[s.status].cls}`}>
                  {statusCfg[s.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SellerMyServicesPanel({
  profile, services, onClose, onEditProfile, onCreateService,
}: {
  profile: SellerProfile;
  services: MyServiceEntry[];
  onClose: () => void;
  onEditProfile: () => void;
  onCreateService: () => void;
}) {
  const t = useT();
  const statusCfg: Record<MyServiceEntry["status"], { label: string; cls: string }> = {
    pending:  { label: t("審査中","Under Review"), cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: t("公開中","Published"),    cls: "bg-green-50 text-green-700 border-green-200" },
    rejected: { label: t("却下","Rejected"),       cls: "bg-red-50 text-red-600 border-red-200" },
  };
  const typeLabels: Record<SellerServiceType, string> = {
    API: "API", WebPage: t("ウェブページ","Web Page"),
    MCPLocal: t("MCPローカル","MCP Local"), MCPRemote: t("MCPリモート","MCP Remote"), FetchAI: "Fetch.ai",
  };

  return (
    <div className="fixed inset-0 z-50 flex" style={{ animation: "wizardSlideIn 0.3s ease-out" }}>
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-navy flex items-center justify-center text-white font-bold text-sm shrink-0">
              {profile.storeName[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{t("マイサービス","My Services")}</h2>
              <p className="text-xs text-gray-400">{profile.storeName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* プロフィールカード */}
          <div className="rounded-2xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("販売者プロフィール","Seller Profile")}</p>
              <button onClick={onEditProfile}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
                  <path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t("編集","Edit")}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xl font-bold text-gray-400 shrink-0">
                {profile.storeName[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{profile.storeName}</p>
                {profile.bio && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{profile.bio}</p>}
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3"><rect x="1" y="3" width="10" height="7" rx="1"/><path d="M1 5l5 3 5-3"/></svg>
                    {profile.contactEmail}
                  </span>
                  {profile.websiteUrl && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 truncate max-w-[140px]">
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3 h-3 shrink-0"><circle cx="6" cy="6" r="5"/><path d="M1 6h10M6 1c-1.5 2-1.5 8 0 10M6 1c1.5 2 1.5 8 0 10"/></svg>
                      {profile.websiteUrl.replace(/^https?:\/\//, "")}
                    </span>
                  )}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 uppercase">{profile.category}</span>
                </div>
              </div>
            </div>
          </div>

          {/* サービス一覧 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-900">{t("登録サービス","Registered Services")} <span className="text-gray-400 font-normal">({services.length})</span></p>
              <button onClick={onCreateService}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-lemon hover:bg-lemon-hover text-text-primary text-xs font-semibold rounded-xl transition-colors">
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-3 h-3">
                  <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
                </svg>
                {t("新しいサービスを作成","Create New Service")}
              </button>
            </div>

            {services.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-gray-200 py-12 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                  <IconStore cls="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">{t("まだサービスがありません","No services yet")}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t("最初のサービスを登録してマーケットプレイスに掲載しましょう。","Register your first service to list it on the marketplace.")}</p>
                </div>
                <button onClick={onCreateService}
                  className="mt-1 px-4 py-2 bg-lemon hover:bg-lemon-hover text-text-primary text-xs font-semibold rounded-xl transition-colors">
                  {t("サービスを作成する","Create Service")}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {services.map(svc => {
                  const sc = statusCfg[svc.status];
                  return (
                    <div key={svc.id} className="rounded-xl border border-gray-200 p-4 flex items-start gap-4 hover:border-gray-300 transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <IconStore cls="w-4.5 h-4.5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-900 truncate">{svc.name}</p>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${sc.cls}`}>{sc.label}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-mono font-semibold bg-gray-100 text-gray-500 border border-gray-200">{typeLabels[svc.serviceType]}</span>
                        </div>
                        {svc.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{svc.description}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{svc.price ? `${svc.price} USDC / ${t("コール","call")}` : "—"} · {t("登録日","Registered")}: {svc.createdAt}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AccountSettingsPage ───────────────────────────────────────────────────────
interface UserProfile {
  id: string; name: string; email: string; buyerId: string | null;
  buyer: { id: string; balanceUsdc: string; kycTier: string; walletAddress: string | null; suspended: boolean } | null;
}

function AccountSettingsPage({ token, onLogout }: { token: string; onLogout: () => void }) {
  const t = useT();
  const [profile,  setProfile]  = useState<UserProfile | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [name,     setName]     = useState("");
  const [wallet,   setWallet]   = useState("");
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: UserProfile) => { setProfile(d); setName(d.name); setWallet(d.buyer?.walletAddress ?? ""); })
      .catch(() => setError(t("プロフィールの取得に失敗しました","Failed to load profile")))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name, walletAddress: wallet }),
      });
      if (!res.ok) throw new Error(t("保存に失敗しました","Failed to save"));
      setSaved(true);
      if (profile) setProfile({ ...profile, name, buyer: profile.buyer ? { ...profile.buyer, walletAddress: wallet } : null });
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 bg-white transition-all";

  if (loading) return <div className="flex items-center justify-center h-48 text-sm text-gray-400">{t("読み込み中…","Loading…")}</div>;

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} className="text-gray-900">
          <circle cx="10" cy="7" r="3"/><path d="M3 17a7 7 0 0114 0" strokeLinecap="round"/>
        </svg>
        <h1 className="text-xl font-bold text-gray-900">{t("アカウント設定","Account Settings")}</h1>
      </div>

      {/* 残高カード */}
      {profile?.buyer && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t("USDC 残高","USDC Balance"),  value: parseFloat(profile.buyer.balanceUsdc).toFixed(4), unit: "USDC" },
            { label: t("KYC ティア","KYC Tier"),     value: profile.buyer.kycTier, unit: "" },
            { label: "Buyer ID",                     value: profile.buyer.id.slice(0,12) + "…", unit: "" },
          ].map(c => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-400 mb-1">{c.label}</p>
              <p className="text-lg font-bold font-mono text-gray-900">{c.value}</p>
              {c.unit && <p className="text-xs text-gray-400 mt-0.5">{c.unit}</p>}
            </div>
          ))}
        </div>
      )}

      {/* プロフィール編集 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-4">{t("プロフィール編集","Edit Profile")}</h2>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("お名前","Name")}</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("メールアドレス","Email")}</label>
            <input type="email" value={profile?.email ?? ""} disabled
              className={inputCls + " opacity-50 cursor-not-allowed"} />
            <p className="text-[10px] text-gray-400 mt-1">{t("メールアドレスは変更できません","Email cannot be changed")}</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("ウォレットアドレス（USDC受取用）","Wallet Address (for USDC)")}</label>
            <input type="text" value={wallet} onChange={e => setWallet(e.target.value)}
              className={inputCls} placeholder="0x..." />
          </div>

          {error  && <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
          {saved  && <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">✓ {t("保存しました","Saved")}</div>}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-lemon hover:bg-lemon-hover text-text-primary text-sm font-semibold rounded-xl transition-colors disabled:opacity-50">
              {saving ? t("保存中…","Saving…") : t("変更を保存する","Save Changes")}
            </button>
          </div>
        </form>
      </div>

      {/* ログアウト */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-1">{t("セッション","Session")}</h2>
        <p className="text-xs text-gray-500 mb-4">{t("ログアウトするとこのデバイスでのセッションが終了します。","Logging out will end your session on this device.")}</p>
        <button onClick={onLogout}
          className="px-5 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors">
          {t("ログアウト","Log Out")}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [page,        setPage]       = useState<Page>("home");
  const [role,        setRole]       = useState<Role>("buyer");
  const [buyerToken,  setBuyerToken] = useState<string>("");
  const [authReady,   setAuthReady]  = useState(false);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [isDemoMode,  setIsDemoMode] = useState(true);
  const [lang,        setLang]       = useState<"ja"|"en">("ja");
  const [tps,         setTps]        = useState(0);
  const [totalTx,     setTotalTx]    = useState(0);
  const [totalAgents, setTotalAgents]= useState(24);
  const [openFlags,   setOpenFlags]  = useState(2);
  const [blockedTx,   setBlockedTx]  = useState(0);
  const [avgRisk,     setAvgRisk]    = useState(22.4);
  const [logs,        setLogs]       = useState<LogEntry[]>([]);
  const [chartData,   setChartData]  = useState<ChartPoint[]>([]);
  const [isHalted,    setIsHalted]   = useState(false);
  const [haltLoading, setHaltLoading]= useState(false);
  const [connStatus,  setConnStatus] = useState<"connecting"|"ok"|"error">("connecting");
  const [clock,       setClock]      = useState("");
  const [uptime,      setUptime]     = useState(0);

  const [apiKeys,        setApiKeys]        = useState<ApiKeyEntry[]>([]);
  const [buyers,         setBuyers]         = useState<Buyer[]>([]);
  const [buyersLoading,  setBuyersLoading]  = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [sellerView,     setSellerView]     = useState<"none"|"onboarding"|"profile"|"wizard"|"myservices">("none");
  const [sellerProfile,  setSellerProfile]  = useState<SellerProfile | null>(null);
  const [myServices,     setMyServices]     = useState<MyServiceEntry[]>([]);

  // ── 認証チェック ──────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("buyer_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    setBuyerToken(token);
    setAuthReady(true);
  }, []);

  function handleLogout() {
    localStorage.removeItem("buyer_token");
    window.location.href = "/login";
  }

  // ホームに戻るたびに残高を再取得
  function navigateTo(p: Page) {
    if (p === "home") setHomeRefreshKey(k => k + 1);
    setPage(p);
  }

  // ── localStorage persistence (SSR-safe) ──────────────────────────────────
  const canSave = useRef(false);
  useEffect(() => {
    if (!authReady) return;
    setPage(load("buyer_page", "home" as Page));
    setApiKeys(load("buyer_apiKeys", []));
    setShowOnboarding(load("buyer_showOnboarding", true));
    setSellerProfile(load("seller_profile", null));
    setMyServices(load("seller_services", []));
    const t = setTimeout(() => { canSave.current = true; }, 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (canSave.current) localStorage.setItem("buyer_page",           JSON.stringify(page)); }, [page]);
  useEffect(() => { if (canSave.current) localStorage.setItem("buyer_apiKeys",        JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { if (canSave.current) localStorage.setItem("buyer_showOnboarding", JSON.stringify(showOnboarding)); }, [showOnboarding]);
  useEffect(() => { if (canSave.current) localStorage.setItem("seller_profile",       JSON.stringify(sellerProfile)); }, [sellerProfile]);
  useEffect(() => { if (canSave.current) localStorage.setItem("seller_services",      JSON.stringify(myServices)); }, [myServices]);

  // ── Buyers: fetch from API on mount ──────────────────────────────────────
  useEffect(() => {
    setBuyersLoading(true);
    fetch(`${API_URL}/api/buyers`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: Buyer[]) => setBuyers(data))
      .catch(() => {}) // API未接続時はサイレント失敗
      .finally(() => setBuyersLoading(false));
  }, []);

  const createBuyer = useCallback(async (name: string, email: string) => {
    const res = await fetch(`${API_URL}/api/buyers`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "作成に失敗しました" }));
      throw new Error(err.error ?? "作成に失敗しました");
    }
    const buyer: Buyer = await res.json();
    setBuyers((prev) => [buyer, ...prev]);
  }, []);

  const addFundsToBuyer = useCallback(async (id: string, amount: number) => {
    const res = await fetch(`${API_URL}/api/buyers/${id}/deposit`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ amountUsdc: amount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "チャージに失敗しました" }));
      throw new Error(err.error ?? "チャージに失敗しました");
    }
    const updated: Buyer = await res.json();
    setBuyers((prev) => prev.map((b) => b.id === id ? updated : b));
  }, []);

  const addApiKey = useCallback((key: string) => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${String(now.getDate()).padStart(2,"0")}日 ${now.getHours() >= 12 ? "午後" : "午前"}${String(now.getHours() > 12 ? now.getHours()-12 : now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")} (UTC)`;
    setApiKeys((prev) => [...prev, { id: Math.random().toString(36).slice(2), key, label: "Playgroundによって生成されました", createdAt: dateStr, revoked: false }]);
  }, []);

  const revokeApiKey = useCallback((id: string) => {
    setApiKeys((prev) => prev.map((k) => k.id === id ? { ...k, revoked: true } : k));
  }, []);

  const haltedRef = useRef(false);
  const tpsRef    = useRef(0);
  const startRef  = useRef(Date.now());

  useEffect(() => {
    setClock(fmtNow());
    const id = setInterval(() => { setClock(fmtNow()); setUptime(Math.floor((Date.now() - startRef.current) / 1000)); }, 1000);
    return () => clearInterval(id);
  }, []);

  const switchMode = useCallback((toDemo: boolean) => {
    setIsDemoMode(toDemo); setTps(0); setTotalTx(0); setLogs([]); setChartData([]);
    setIsHalted(false); setConnStatus("connecting");
    setTotalAgents(toDemo ? 24 : 0); setOpenFlags(toDemo ? 2 : 0);
    setBlockedTx(0); setAvgRisk(toDemo ? 22.4 : 0);
    haltedRef.current = false; tpsRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isDemoMode) return;
    const a = setInterval(() => { if (haltedRef.current) return; const v = randInt(12, 48); tpsRef.current = v; setTps(v); }, 150);
    const b = setInterval(() => { if (haltedRef.current) return; setTotalTx((p) => p + Math.max(1, Math.round(tpsRef.current * 0.1))); }, 100);
    const c = setInterval(() => { if (haltedRef.current) return; setLogs((p) => [makeDummyLog(), ...p].slice(0, MAX_LOG)); }, 200);
    const d = setInterval(() => { if (haltedRef.current) return; setChartData((p) => [...p, { t: fmtNow(), tps: tpsRef.current }].slice(-MAX_CHART_PTS)); }, 1000);
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); clearInterval(d); };
  }, [isDemoMode]);

  useEffect(() => {
    if (isDemoMode) return;
    const poll = async () => {
      try {
        const [sR, kR] = await Promise.all([fetch(`${API_URL}/api/stats`), fetch(`${API_URL}/api/killswitch`)]);
        if (!sR.ok || !kR.ok) throw new Error();
        const s = await sR.json(); const k = await kR.json();
        setTps(s.recentTps); setTotalTx(s.totalTx); setTotalAgents(s.totalAgents ?? 0);
        setOpenFlags(s.openFraudFlags ?? 0); setBlockedTx(s.blockedTx ?? 0); setAvgRisk(s.avgRiskScore ?? 0);
        setIsHalted(k.isHalted); haltedRef.current = k.isHalted; setConnStatus("ok");
        setLogs((s.recentLogs as Array<{ id: string; from: string; to: string; amount: number; currency: string; txHash: string | null; status: TxStatus; riskScore: number; flagged: boolean; createdAt: string; }>)
          .map((r) => ({ ...r, createdAt: new Date(r.createdAt).toLocaleTimeString("ja-JP", { hour12: false }) })));
        setChartData((p) => [...p, { t: fmtNow(), tps: s.recentTps }].slice(-MAX_CHART_PTS));
      } catch { setConnStatus("error"); }
    };
    poll(); const id = setInterval(poll, 1500); return () => clearInterval(id);
  }, [isDemoMode]);

  const toggleHalt = useCallback(async () => {
    if (isDemoMode) { setIsHalted((p) => { haltedRef.current = !p; return !p; }); return; }
    setHaltLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/killswitch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ halt: !isHalted }) });
      const data = await res.json(); setIsHalted(data.isHalted); haltedRef.current = data.isHalted;
    } catch {}
    setHaltLoading(false);
  }, [isDemoMode, isHalted]);

  // PAGE_TITLES unused in render — kept for reference only

  return (
    <LangContext.Provider value={lang}>
    <div className="flex h-screen overflow-hidden bg-canvas">
      {isHalted && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center pt-6"
          style={{ background: "radial-gradient(ellipse at center, rgba(220,38,38,0.05) 0%, transparent 70%)" }}>
          <p className="text-2xl font-black tracking-[0.2em] text-red-600 animate-halt-blink select-none">SYSTEM HALTED</p>
        </div>
      )}

      <Sidebar
        page={page} setPage={navigateTo}
        role={role} setRole={setRole}
        isDemoMode={isDemoMode} onModeToggle={() => switchMode(!isDemoMode)}
        isHalted={isHalted} connStatus={connStatus}
        clock={clock} uptime={uptime} openFlags={openFlags}
        sellerProfile={sellerProfile}
        onSellerSetup={() => sellerProfile ? setSellerView("myservices") : setSellerView("onboarding")}
        lang={lang} setLang={setLang}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-7 pt-8 pb-5">
          {/* ── バイヤーページ ── */}
          {page === "home"         && <HomePage buyerToken={buyerToken} onNavigate={navigateTo} refreshKey={homeRefreshKey} />}
          {page === "transactions" && <TokensPage buyerToken={buyerToken} onTokenIssued={() => setHomeRefreshKey(k => k + 1)} />}
          {page === "agents"       && <ApiKeysPage keys={apiKeys} onAdd={() => navigateTo("jpyc")} onRevoke={revokeApiKey} />}
          {page === "fraud"        && <ChargesPage buyerToken={buyerToken} />}
          {page === "usdc"         && <USDCDepositPage buyerToken={buyerToken} />}
          {page === "jpyc"         && <JPYCDepositPage buyerToken={buyerToken} />}
          {page === "directory"    && <DirectoryPage />}
          {page === "account"      && <AccountSettingsPage token={buyerToken} onLogout={handleLogout} />}
          {/* ── セラーページ ── */}
          {page === "seller-services"  && (
            sellerProfile
              ? <SellerServicesPage profile={sellerProfile} services={myServices} onEditProfile={() => setSellerView("profile")} onCreateService={() => setSellerView("wizard")} />
              : <SellerSetupPrompt onStart={() => setSellerView("onboarding")} />
          )}
          {page === "seller-stats"     && <SellerStatsPage services={myServices} />}
          {page === "seller-directory" && <DirectoryPage />}
          {page === "seller-account"   && <AccountSettingsPage token={buyerToken} onLogout={handleLogout} />}
        </div>
      </main>

      {/* ── 販売者オンボーディングモーダル ── */}
      {sellerView === "onboarding" && (
        <SellerOnboardingModal
          onClose={() => setSellerView("none")}
          onStart={() => setSellerView("profile")}
        />
      )}

      {/* ── 販売者プロフィール作成・編集 ── */}
      {sellerView === "profile" && (
        <SellerProfilePanel
          initial={sellerProfile ?? SELLER_PROFILE_INITIAL}
          onClose={() => setSellerView(sellerProfile ? "myservices" : "none")}
          onSave={(p) => { setSellerProfile(p); setSellerView("myservices"); }}
        />
      )}

      {/* ── マイサービス管理 ── */}
      {sellerView === "myservices" && sellerProfile && (
        <SellerMyServicesPanel
          profile={sellerProfile}
          services={myServices}
          onClose={() => setSellerView("none")}
          onEditProfile={() => setSellerView("profile")}
          onCreateService={() => setSellerView("wizard")}
        />
      )}

      {/* ── 販売者サービス作成ウィザード ── */}
      {sellerView === "wizard" && (
        <SellerWizardPanel
          onClose={() => setSellerView(sellerProfile ? "myservices" : "none")}
          onSubmitted={(entry) => {
            setMyServices(prev => [...prev, entry]);
            setSellerView("myservices");
          }}
          sellerProviderId={sellerProfile?.providerId ?? ""}
        />
      )}
    </div>
    </LangContext.Provider>
  );
}
