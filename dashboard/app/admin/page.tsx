"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

// ── API型定義 ──────────────────────────────────────────────────────────────────
interface ApiServiceRaw {
  id: string; providerId: string; providerName: string;
  name: string; type: "API" | "MCP";
  pricePerCallUsdc: string;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  verified: boolean; createdAt: string;
}

function mapApiService(s: ApiServiceRaw): ServiceType {
  return {
    id:           s.id,
    name:         s.name,
    provider:     s.providerName,
    type:         s.type,
    pricePerCall: parseFloat(s.pricePerCallUsdc) || 0,
    tokenType:    "kyapay",
    reviewStatus: s.reviewStatus.toLowerCase() as "pending" | "approved" | "rejected",
    verified:     s.verified,
    submittedAt:  new Date(s.createdAt).toLocaleDateString("ja-JP"),
    calls30d:     0,
    revenue30d:   0,
  };
}

// ── Seeded PRNG (deterministic SSR/CSR) ──────────────────────────────────────
let _seed = 0xdeadbeef;
function sr() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 0x100000000; }
const pick = <T,>(a: readonly T[]): T => a[Math.floor(sr() * a.length)];
const ri = (a: number, b: number) => Math.floor(sr() * (b - a + 1)) + a;
function rndAddr() { return `0x${Array.from({length:8},()=>Math.floor(sr()*256).toString(16).padStart(2,"0")).join("")}…`; }
function rndId(p:string,n:number){ return `${p}_${String(n+1).padStart(3,"0")}`; }

// ── Demo Data ────────────────────────────────────────────────────────────────
const SERVICE_NAMES = ["GPT-4o Inference","Weather Forecast API","Claude 3.5 Haiku","Web Search MCP","Image Generation API","JPYC Payment Gateway","Code Execution Sandbox","Translation API","PDF Parsing MCP","Stock Data Feed","Email Dispatch MCP","SQL Query Service"];
const PROVIDERS     = ["OpenAI","OpenWeather Inc.","Anthropic","Brave Search","Stability AI","JPYC Inc.","Sandpack","DeepL","DocParser","Bloomberg OSS","SendGrid","Turso"];
const SERVICE_TYPES = ["API","API","API","MCP","API","API","MCP","API","MCP","API","MCP","API"] as const;
const REVIEW_STATUS = ["pending","pending","pending","approved","approved","approved","approved","approved","approved","rejected","pending","approved"] as const;
const TOKEN_TYPES   = ["kyapay","kya","pay","kyapay","pay","kyapay","kya","pay","kyapay","kya","pay","kyapay"] as const;

const DEMO_SERVICES = SERVICE_NAMES.map((name, i) => ({
  id: rndId("svc", i),
  name,
  provider: PROVIDERS[i],
  type: SERVICE_TYPES[i],
  pricePerCall: parseFloat((0.001 + sr() * 0.099).toFixed(4)),
  tokenType: TOKEN_TYPES[i],
  reviewStatus: REVIEW_STATUS[i],
  verified: REVIEW_STATUS[i] === "approved" && sr() > 0.4,
  submittedAt: `2026/3/${(1 + (i * 3 % 28)).toString().padStart(2,"0")}`,
  calls30d: ri(0, 50000),
  revenue30d: parseFloat((sr() * 2000).toFixed(2)),
}));

const TIERS = ["none","none","none","kya","kya","kyc"] as const;
const DEMO_ACCOUNTS = Array.from({length: 24}, (_, i) => {
  const tier = pick(TIERS);
  return {
    id: rndId("usr", i),
    name: ["Alice Chen","Bob Martinez","Carol Kim","David Liu","Eve Tanaka","Frank Müller","Grace Park","Henry Sato","Iris Novak","Jack Walsh","Kira Patel","Leo Santos"][i % 12],
    email: `user${i+1}@example.com`,
    tier,
    agentCount: ri(1, 8),
    totalSpend: parseFloat((sr() * 5000).toFixed(2)),
    suspended: sr() < 0.06,
    createdAt: `2026/${1 + (i % 3)}/${(1 + (i * 5 % 28)).toString().padStart(2,"0")}`,
  };
});

const LOG_LEVELS  = ["normal","normal","normal","normal","warn","warn","block"] as const;
const LOG_ACTIONS = ["transfer_confirmed","transfer_confirmed","api_call_ok","api_call_ok","velocity_breach","amount_anomaly","transfer_blocked_fraud","budget_breach","circuit_breaker_trip","admin_action","kyc_upgrade","kya_issued"] as const;
const LOG_AGENTS  = Array.from({length:60}, (_,i) => rndId("agt", ri(0,23)));

const DEMO_LOGS = Array.from({length: 80}, (_, i) => {
  const level  = pick(LOG_LEVELS);
  const action = pick(LOG_ACTIONS);
  const amount = parseFloat((sr() * 500).toFixed(4));
  return {
    id: rndId("evt", i),
    ts: `2026/4/${(1+(i%9)).toString().padStart(2,"0")} ${(8+(i%14)).toString().padStart(2,"0")}:${(i*7%60).toString().padStart(2,"0")}:${(i*13%60).toString().padStart(2,"0")}`,
    level,
    action,
    agentId: LOG_AGENTS[i],
    amount,
    currency: pick(["USDC","USDC","JPYC"] as const),
    riskScore: level === "block" ? ri(70,99) : level === "warn" ? ri(40,69) : ri(0,39),
    resolved: i > 10 || level === "normal",
  };
});

const DEMO_CIRCUITS = [
  { id:"cb_001", pair:"agt_007 → agt_023", state:"open",      failures:7,  threshold:5,  lastTrip:"2026/4/09 22:14" },
  { id:"cb_002", pair:"agt_014 → agt_002", state:"half-open", failures:3,  threshold:5,  lastTrip:"2026/4/09 19:03" },
  { id:"cb_003", pair:"agt_031 → agt_009", state:"open",      failures:5,  threshold:5,  lastTrip:"2026/4/09 23:41" },
  { id:"cb_004", pair:"agt_005 → agt_018", state:"closed",    failures:0,  threshold:5,  lastTrip:"2026/4/08 11:22" },
  { id:"cb_005", pair:"agt_019 → agt_004", state:"closed",    failures:1,  threshold:5,  lastTrip:"2026/4/07 08:55" },
];

const DEMO_SETTLEMENTS = Array.from({length: 8}, (_, i) => ({
  id: rndId("stl", i),
  provider: PROVIDERS[i],
  amount: parseFloat((200 + sr() * 1800).toFixed(2)),
  currency: "USDC",
  period: `2026年3月`,
  status: i < 3 ? "pending" : "paid",
  dueAt: `2026/4/${(10 + i * 2).toString().padStart(2,"0")}`,
}));

// ── Types ─────────────────────────────────────────────────────────────────────
type NavSection = "overview" | "marketplace" | "monitoring" | "finance" | "buyers" | "jpyc";
type MarketTab  = "services" | "accounts";
type MonitorTab = "all" | "warn" | "block";

// ── Icons ─────────────────────────────────────────────────────────────────────
const Ico = {
  Overview:    ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>,
  Marketplace: ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 7l7-4 7 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" strokeLinejoin="round"/><path d="M8 17v-6h4v6"/></svg>,
  Monitor:     ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M3 4h14v10H3z" rx="1" strokeLinejoin="round"/><path d="M7 17h6M10 14v3" strokeLinecap="round"/></svg>,
  Finance:     ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="10" cy="10" r="7"/><path d="M10 7v1.5a1.5 1.5 0 000 3 1.5 1.5 0 010 3V16M10 7a2 2 0 012 2M10 16a2 2 0 01-2-2" strokeLinecap="round"/></svg>,
  Check:       ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3.5 3.5L13 4"/></svg>,
  Shield:      ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}><path d="M8 2l5 2.5V8c0 3-2 5.5-5 6.5C5 13.5 3 11 3 8V4.5L8 2z" strokeLinejoin="round"/></svg>,
  Alert:       ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M8 2l6 11H2L8 2z" strokeLinejoin="round"/><path d="M8 7v3M8 12h.01"/></svg>,
  User:        ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="8" cy="5" r="3"/><path d="M2 14a6 6 0 0112 0" strokeLinecap="round"/></svg>,
  Ban:         ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="8" cy="8" r="6"/><path d="M4 4l8 8" strokeLinecap="round"/></svg>,
  Bolt:        ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M9 2L4 9h4l-1 5 6-7H9l1-5z"/></svg>,
  Verified:    ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.7 2.1 2.6-.6.1 2.7 2.4 1.2-1.3 2.4 1.3 2.4-2.4 1.2-.1 2.7-2.6-.6L8 15l-1.7-2.1-2.6.6-.1-2.7-2.4-1.2 1.3-2.4-1.3-2.4 2.4-1.2.1-2.7 2.6.6L8 1z"/><path d="M5.5 8l2 2 3-3" stroke="white" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Halt:        ({cls}:{cls?:string}) => <svg className={cls} viewBox="0 0 20 20" fill="currentColor"><rect x="4" y="4" width="12" height="12" rx="2"/></svg>,
};

// ── Shared components ─────────────────────────────────────────────────────────
function TierBadge({tier}: {tier: string}) {
  const c: Record<string, string> = {
    none: "bg-gray-100 text-gray-500 border-gray-200",
    kya:  "bg-violet-50 text-violet-700 border-violet-200",
    kyc:  "bg-sky-50 text-sky-700 border-sky-200",
  };
  const l: Record<string, string> = { none: "未認証", kya: "KYA", kyc: "KYC" };
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${c[tier]??c.none}`}>{l[tier]??tier}</span>;
}

function Pill({label, variant}: {label:string; variant:"green"|"red"|"amber"|"gray"|"blue"|"violet"}) {
  const c = {
    green:  "bg-green-50 text-green-700 border-green-200",
    red:    "bg-red-50 text-red-700 border-red-200",
    amber:  "bg-amber-50 text-amber-700 border-amber-200",
    gray:   "bg-gray-100 text-gray-500 border-gray-200",
    blue:   "bg-blue-50 text-blue-700 border-blue-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  }[variant];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${c}`}>{label}</span>;
}

function Btn({label,color,size="sm",onClick,disabled}:{label:string;color:"red"|"green"|"violet"|"sky"|"gray"|"amber";size?:"sm"|"xs";onClick?:()=>void;disabled?:boolean}) {
  const c = {
    red:    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    green:  "border-green-200 bg-green-50 text-green-700 hover:bg-green-100",
    violet: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100",
    sky:    "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
    gray:   "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100",
    amber:  "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  }[color];
  const s = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  return <button onClick={onClick} disabled={disabled} className={`rounded-md border font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${c} ${s}`}>{label}</button>;
}

function KpiCard({label,value,unit,delta,color="default"}:{label:string;value:string|number;unit?:string;delta?:string;color?:"default"|"green"|"red"|"blue"|"amber"|"violet"}) {
  const vc = {default:"text-gray-900",green:"text-green-600",red:"text-red-600",blue:"text-blue-600",amber:"text-amber-600",violet:"text-violet-600"}[color];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-medium text-gray-400 mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold font-mono tabular-nums ${vc}`}>{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {delta && <p className="text-xs text-gray-400 mt-1">{delta}</p>}
    </div>
  );
}

function SectionHeader({title, count, children}: {title:string; count?:number; children?: React.ReactNode}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {count !== undefined && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Th({children,right}:{children:React.ReactNode;right?:boolean}) {
  return <th className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100 whitespace-nowrap ${right?"text-right":"text-left"}`}>{children}</th>;
}

function Td({children,right,mono,cls}:{children:React.ReactNode;right?:boolean;mono?:boolean;cls?:string}) {
  return <td className={`px-3 py-2.5 text-xs border-b border-gray-50 align-middle ${right?"text-right":"text-left"} ${mono?"font-mono tabular-nums":""} ${cls??""}`}>{children}</td>;
}

// ── TaskBadge for overview ─────────────────────────────────────────────────────
function TaskItem({icon, label, count, urgent, onClick}: {icon:React.ReactNode; label:string; count:number; urgent?:boolean; onClick?:()=>void}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left ${urgent?"border-red-200 bg-red-50 hover:bg-red-100":"border-gray-200 bg-white hover:bg-gray-50"}`}>
      <span className={`flex-shrink-0 ${urgent?"text-red-500":"text-gray-400"}`}>{icon}</span>
      <span className="flex-1 text-sm text-gray-700 font-medium">{label}</span>
      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${urgent?"bg-red-500 text-white":"bg-gray-200 text-gray-600"}`}>{count}</span>
    </button>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({msg, type, onDone}: {msg:string; type:"success"|"error"|"info"; onDone:()=>void}) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return ()=>clearTimeout(t); }, [onDone]);
  const bg = type==="success"?"bg-gray-900 text-white" : type==="error"?"bg-red-600 text-white" : "bg-blue-600 text-white";
  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold ${bg} animate-fade-in`}>
      {type==="success" && <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l3.5 3.5L13 4"/></svg>}
      {type==="error"   && <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>}
      {msg}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({title, onClose, children, wide}: {title:string; onClose:()=>void; children:React.ReactNode; wide?:boolean}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"/>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide?"max-w-2xl":"max-w-lg"} max-h-[88vh] overflow-y-auto`} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

type ServiceType = {
  id: string; name: string; provider: string;
  type: "API" | "MCP";
  pricePerCall: number; tokenType: string;
  reviewStatus: "pending" | "approved" | "rejected";
  verified: boolean; submittedAt: string;
  calls30d: number; revenue30d: number;
};
type AccountType = typeof DEMO_ACCOUNTS[0];

// ── AddServiceModal（API接続版）────────────────────────────────────────────────
interface ProviderOption { id: string; name: string; }

function AddServiceModal({onClose, onAdd}: {
  onClose: ()=>void;
  onAdd: (svc: ServiceType)=>void;
}) {
  const [name,       setName]       = useState("");
  const [providerId, setProviderId] = useState("");
  const [type,       setType]       = useState<"API"|"MCP">("API");
  const [price,      setPrice]      = useState("");
  const [providers,  setProviders]  = useState<ProviderOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState("");

  // プロバイダー一覧を取得
  useEffect(() => {
    fetch(`${API_URL}/api/providers`)
      .then(r => r.json())
      .then((data: ProviderOption[]) => {
        setProviders(Array.isArray(data) ? data : []);
        if (data.length === 1) setProviderId(data[0].id);
      })
      .catch(() => setProviders([]));
  }, []);

  async function submit() {
    if (!name.trim())  { setError("サービス名を入力してください"); return; }
    if (!providerId)   { setError("プロバイダーを選択してください"); return; }
    const p = parseFloat(price);
    if (isNaN(p) || p < 0) { setError("単価は0以上の数値で入力してください"); return; }

    setSubmitting(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/services`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          name: name.trim(),
          type,
          pricePerCallUsdc: price || "0",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const created: ApiServiceRaw = await res.json();
      onAdd(mapApiService(created));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

  return (
    <Modal title="サービスを追加" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>サービス名 <span className="text-red-500">*</span></label>
          <input className={inputCls} placeholder="例: GPT-4o Inference" value={name} onChange={e=>{setName(e.target.value);setError("");}}/>
        </div>
        <div>
          <label className={labelCls}>プロバイダー <span className="text-red-500">*</span></label>
          {providers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">読み込み中…</p>
          ) : (
            <select className={inputCls} value={providerId} onChange={e=>{setProviderId(e.target.value);setError("");}}>
              <option value="">プロバイダーを選択…</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>タイプ</label>
            <select className={inputCls} value={type} onChange={e=>setType(e.target.value as "API"|"MCP")}>
              <option value="API">API</option>
              <option value="MCP">MCP</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>1コール単価 (USDC) <span className="text-red-500">*</span></label>
            <input className={inputCls} placeholder="例: 0.0025" type="number" min="0" step="0.0001" value={price} onChange={e=>{setPrice(e.target.value);setError("");}}/>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
          追加後は <strong>審査中</strong> になります。このページから即座に承認できます。
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">キャンセル</button>
          <button onClick={submit} disabled={submitting} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {submitting ? "登録中…" : "追加する"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── ServiceDetailModal ────────────────────────────────────────────────────────
function ServiceDetailModal({svc, onClose, onApprove, onReject, onVerify}: {
  svc: ServiceType; onClose:()=>void;
  onApprove:(id:string)=>void; onReject:(id:string)=>void; onVerify:(id:string)=>void;
}) {
  return (
    <Modal title="サービス詳細" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{svc.name}</h3>
              {svc.verified && <Ico.Verified cls="w-4 h-4 text-blue-500 flex-shrink-0"/>}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{svc.provider}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Pill label={svc.type} variant={svc.type==="MCP"?"violet":"blue"}/>
            {svc.reviewStatus==="pending"  && <Pill label="審査中"  variant="amber"/>}
            {svc.reviewStatus==="approved" && <Pill label="承認済み" variant="green"/>}
            {svc.reviewStatus==="rejected" && <Pill label="却下"    variant="red"/>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["単価",         `$${svc.pricePerCall.toFixed(4)}`],
            ["月間コール数", svc.calls30d.toLocaleString()],
            ["月間収益",     `$${svc.revenue30d.toFixed(2)}`],
          ].map(([l,v])=>(
            <div key={l} className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium">{l}</p>
              <p className="text-sm font-bold font-mono text-gray-900 mt-1">{v}</p>
            </div>
          ))}
        </div>
        <div className="divide-y divide-gray-50 text-xs">
          {([
            ["サービスID",    svc.id],
            ["トークンタイプ", svc.tokenType],
            ["提出日",        svc.submittedAt],
            ["OpenAPI仕様",   `https://api.${svc.provider.toLowerCase().replace(/[^a-z]/g,"")}.example/openapi.json`],
          ] as [string,string][]).map(([k,v])=>(
            <div key={k} className="flex items-center justify-between py-2.5">
              <span className="text-gray-400 font-medium w-28 flex-shrink-0">{k}</span>
              <span className="font-mono text-gray-700 text-right truncate max-w-xs">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          {svc.reviewStatus==="pending" && <>
            <Btn label="✓ 承認する" color="green" onClick={()=>{onApprove(svc.id);onClose();}}/>
            <Btn label="✕ 却下する" color="red" onClick={()=>{onReject(svc.id);onClose();}}/>
          </>}
          {svc.reviewStatus==="approved" && (
            <Btn label={svc.verified?"Verified を取り消す":"Verified バッジを付与する"} color={svc.verified?"gray":"sky"} onClick={()=>onVerify(svc.id)}/>
          )}
          {svc.reviewStatus==="rejected" && (
            <Btn label="再審査する" color="amber" onClick={()=>{onApprove(svc.id);onClose();}}/>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── AccountDetailModal ────────────────────────────────────────────────────────
function AccountDetailModal({acc, onClose, onToggle}: {
  acc: AccountType; onClose:()=>void; onToggle:(id:string)=>void;
}) {
  const agentIds = Array.from({length: acc.agentCount}, (_, i) => rndId("agt", (i * 3 + parseInt(acc.id.split("_")[1]) % 20)));
  return (
    <Modal title="アカウント詳細" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-gray-500">{acc.name[0]}</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">{acc.name}</h3>
              <TierBadge tier={acc.tier}/>
              {acc.suspended && <Pill label="停止中" variant="red"/>}
            </div>
            <p className="text-xs text-gray-500">{acc.email}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([
            ["エージェント数", String(acc.agentCount)],
            ["累計支出",       `$${acc.totalSpend.toFixed(2)}`],
            ["登録日",         acc.createdAt],
          ] as [string,string][]).map(([l,v])=>(
            <div key={l} className="bg-gray-50 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 font-medium">{l}</p>
              <p className="text-xs font-bold font-mono text-gray-900 mt-1">{v}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">紐付けエージェント</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {agentIds.map(id=>(
              <div key={id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"/>
                <span className="font-mono text-xs text-gray-700">{id}</span>
                <span className="ml-auto text-[10px] text-gray-400">アクティブ</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <Btn label={acc.suspended?"利用停止を解除する":"アカウントを停止する"} color={acc.suspended?"green":"red"} onClick={()=>onToggle(acc.id)}/>
        </div>
      </div>
    </Modal>
  );
}

// ── Overview page ─────────────────────────────────────────────────────────────
type LogEntry     = typeof DEMO_LOGS[0];
type CircuitEntry = typeof DEMO_CIRCUITS[0];

function OverviewPage({setNav, services, logs, circuits, accounts}: {
  setNav:(n:NavSection)=>void;
  services: ServiceType[]; logs: LogEntry[];
  circuits: CircuitEntry[]; accounts: AccountType[];
}) {
  const totalVol   = logs.filter(l=>l.level==="normal"&&l.action.includes("transfer")).reduce((a,b)=>a+b.amount,0);
  const pendingSvc = services.filter(s=>s.reviewStatus==="pending").length;
  const openFlags  = logs.filter(l=>!l.resolved&&l.level!=="normal").length;
  const openCB     = circuits.filter(c=>c.state!=="closed").length;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="総流通額（30d）" value={`$${totalVol.toFixed(0)}`} color="blue"/>
        <KpiCard label="登録サービス数" value={services.filter(s=>s.reviewStatus==="approved").length} unit="件" delta={`うち審査中 ${pendingSvc}件`} color="default"/>
        <KpiCard label="アクティブユーザー" value={accounts.filter(a=>!a.suspended).length} unit="名" color="green"/>
        <KpiCard label="未解決フラグ" value={openFlags} unit="件" delta={`CB障害 ${openCB}件`} color={openFlags>0?"red":"default"}/>
      </div>

      {/* Tasks */}
      <div>
        <h2 className="text-sm font-bold text-gray-900 mb-3">要対応タスク</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <TaskItem icon={<Ico.Marketplace cls="w-4 h-4"/>} label="新規サービス審査待ち" count={pendingSvc} urgent={pendingSvc>3} onClick={()=>setNav("marketplace")}/>
          <TaskItem icon={<Ico.Alert cls="w-4 h-4"/>} label="未解決リスクフラグ" count={openFlags} urgent={openFlags>0} onClick={()=>setNav("monitoring")}/>
          <TaskItem icon={<Ico.Bolt cls="w-4 h-4"/>} label="サーキットブレーカー障害" count={openCB} urgent={openCB>0} onClick={()=>setNav("monitoring")}/>
          <TaskItem icon={<Ico.Finance cls="w-4 h-4"/>} label="精算待ちプロバイダー" count={0} onClick={()=>setNav("finance")}/>
        </div>
      </div>

      {/* Recent events */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">最新イベント</h3>
          <button className="text-xs text-blue-600 hover:underline" onClick={()=>setNav("monitoring")}>すべて表示 →</button>
        </div>
        <table className="w-full">
          <thead><tr><Th>日時</Th><Th>レベル</Th><Th>アクション</Th><Th>エージェント</Th><Th right>リスク</Th></tr></thead>
          <tbody>
            {logs.slice(0,10).map(log=>(
              <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                <Td mono cls="text-gray-400 text-[10px]">{log.ts}</Td>
                <Td>
                  {log.level==="block" ? <Pill label="BLOCK" variant="red"/> : log.level==="warn" ? <Pill label="WARN" variant="amber"/> : <Pill label="OK" variant="green"/>}
                </Td>
                <Td cls="font-mono text-[11px] text-gray-700">{log.action}</Td>
                <Td mono cls="text-gray-500 text-[11px]">{log.agentId}</Td>
                <Td right mono>
                  <span className={`text-xs font-semibold ${log.riskScore>=70?"text-red-600":log.riskScore>=40?"text-amber-600":"text-green-600"}`}>{log.riskScore}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Marketplace & Users page ──────────────────────────────────────────────────
function MarketplacePage({services, setServices, accounts, setAccounts, token}: {
  services: ServiceType[]; setServices: React.Dispatch<React.SetStateAction<ServiceType[]>>;
  accounts: AccountType[]; setAccounts: React.Dispatch<React.SetStateAction<AccountType[]>>;
  token: string;
}) {
  const [tab, setTab] = useState<MarketTab>("services");
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<"all"|"pending"|"approved"|"rejected">("all");
  const [selectedSvc, setSelectedSvc] = useState<ServiceType|null>(null);
  const [selectedAcc, setSelectedAcc] = useState<AccountType|null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"}|null>(null);

  function showToast(msg:string, type:"success"|"error"|"info"="success") {
    setToast({msg,type});
    setTimeout(()=>setToast(null), 2500);
  }

  const filteredSvc = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.provider.toLowerCase().includes(search.toLowerCase());
    const matchFilter = reviewFilter === "all" || s.reviewStatus === reviewFilter;
    return matchSearch && matchFilter;
  });

  const filteredAcc = accounts.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase())
  );

  function addService(svc: ServiceType) {
    setServices(prev => [svc, ...prev]);
    setShowAddModal(false);
    showToast("サービスを追加しました（審査中）", "info");
  }

  const authHeader = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  async function approveService(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/services/${id}/review`, {
        method:  "PATCH",
        headers: authHeader,
        body:    JSON.stringify({ reviewStatus: "APPROVED" }),
      });
      if (res.status === 401) { showToast("セッションが切れました。再ログインしてください", "error"); return; }
      if (!res.ok) throw new Error("API error");
      setServices(prev => prev.map(s => s.id===id ? {...s, reviewStatus:"approved" as const, verified: true} : s));
      showToast("サービスを承認しました ✓");
    } catch {
      showToast("承認に失敗しました", "error");
    }
  }
  async function rejectService(id: string) {
    try {
      const res = await fetch(`${API_URL}/api/services/${id}/review`, {
        method:  "PATCH",
        headers: authHeader,
        body:    JSON.stringify({ reviewStatus: "REJECTED" }),
      });
      if (res.status === 401) { showToast("セッションが切れました。再ログインしてください", "error"); return; }
      if (!res.ok) throw new Error("API error");
      setServices(prev => prev.map(s => s.id===id ? {...s, reviewStatus:"rejected" as const} : s));
      showToast("サービスを却下しました", "error");
    } catch {
      showToast("却下処理に失敗しました", "error");
    }
  }
  function verifyService(id: string) {
    setServices(prev => {
      const next = prev.map(s => s.id===id ? {...s, verified:!s.verified} : s);
      const isVerified = next.find(s=>s.id===id)?.verified;
      showToast(isVerified ? "Verified バッジを付与しました" : "Verified を取り消しました", isVerified?"success":"info");
      return next;
    });
  }
  function toggleSuspend(id: string) {
    setAccounts(prev => {
      const next = prev.map(a => a.id===id ? {...a, suspended:!a.suspended} : a);
      const isSuspended = next.find(a=>a.id===id)?.suspended;
      showToast(isSuspended ? "アカウントを停止しました" : "停止を解除しました", isSuspended?"error":"success");
      return next;
    });
    // Sync modal state too
    setSelectedAcc(prev => prev?.id===id ? {...prev, suspended:!prev.suspended} : prev);
  }

  const pendingCount = services.filter(s=>s.reviewStatus==="pending").length;

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {selectedSvc && <ServiceDetailModal svc={selectedSvc} onClose={()=>setSelectedSvc(null)} onApprove={approveService} onReject={rejectService} onVerify={verifyService}/>}
      {selectedAcc && <AccountDetailModal acc={selectedAcc} onClose={()=>setSelectedAcc(null)} onToggle={toggleSuspend}/>}
      {showAddModal && <AddServiceModal onClose={()=>setShowAddModal(false)} onAdd={addService}/>}
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([["services","サービス審査"],["accounts","アカウント管理"]] as const).map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab===t?"bg-white text-gray-900 shadow-sm":"text-gray-500 hover:text-gray-700"}`}>
            {l}{t==="services"&&pendingCount>0&&<span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <input
          value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={tab==="services"?"サービス名・プロバイダーで検索…":"ユーザー名・メールで検索…"}
          className="flex-1 max-w-sm text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 bg-white"
        />
        {tab==="services" && (
          <div className="flex items-center gap-1">
            {(["all","pending","approved","rejected"] as const).map(f=>(
              <button key={f} onClick={()=>setReviewFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${reviewFilter===f?"bg-gray-900 text-white":"bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                {f==="all"?"すべて":f==="pending"?"審査中":f==="approved"?"承認済み":"却下"}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto">
          {tab==="services" && (
            <button
              onClick={()=>setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
              サービス追加
            </button>
          )}
        </div>
      </div>

      {/* Services table */}
      {tab === "services" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <SectionHeader title="サービス一覧" count={filteredSvc.length}>
            <span className="px-3 invisible"/>
          </SectionHeader>
          <div className="px-0">
          <table className="w-full">
            <thead><tr>
              <Th>サービス名</Th><Th>プロバイダー</Th><Th>タイプ</Th>
              <Th right>単価</Th><Th>トークン</Th><Th>ステータス</Th><Th>提出日</Th><Th>操作</Th>
            </tr></thead>
            <tbody>
              {filteredSvc.map(s=>(
                <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={()=>setSelectedSvc(s)}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-gray-900">{s.name}</span>
                      {s.verified && <Ico.Verified cls="w-3.5 h-3.5 text-blue-500 flex-shrink-0"/>}
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">{s.id}</p>
                  </Td>
                  <Td cls="text-gray-600 text-[11px]">{s.provider}</Td>
                  <Td><Pill label={s.type} variant={s.type==="MCP"?"violet":"blue"}/></Td>
                  <Td right mono cls="text-gray-700">${s.pricePerCall.toFixed(4)}</Td>
                  <Td><span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{s.tokenType}</span></Td>
                  <Td>
                    {s.reviewStatus==="pending" && <Pill label="審査中" variant="amber"/>}
                    {s.reviewStatus==="approved" && <Pill label="承認済み" variant="green"/>}
                    {s.reviewStatus==="rejected" && <Pill label="却下" variant="red"/>}
                  </Td>
                  <Td mono cls="text-gray-400 text-[10px]">{s.submittedAt}</Td>
                  <Td>
                    <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                      {s.reviewStatus==="pending" && <>
                        <Btn label="承認" color="green" size="xs" onClick={()=>approveService(s.id)}/>
                        <Btn label="却下" color="red" size="xs" onClick={()=>rejectService(s.id)}/>
                      </>}
                      {s.reviewStatus==="approved" && (
                        <Btn label={s.verified?"Verified取消":"Verified付与"} color={s.verified?"gray":"sky"} size="xs" onClick={()=>verifyService(s.id)}/>
                      )}
                      {s.reviewStatus==="rejected" && (
                        <Btn label="再審査" color="amber" size="xs" onClick={()=>approveService(s.id)}/>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Accounts table */}
      {tab === "accounts" && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead><tr>
              <Th>ユーザー</Th><Th>メール</Th><Th>KYA/KYC</Th>
              <Th right>エージェント数</Th><Th right>累計支出</Th><Th>登録日</Th><Th>状態</Th><Th>操作</Th>
            </tr></thead>
            <tbody>
              {filteredAcc.map(a=>(
                <tr key={a.id} className={`hover:bg-gray-50 transition-colors cursor-pointer ${a.suspended?"opacity-60":""}`} onClick={()=>setSelectedAcc(a)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-gray-500">{a.name[0]}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-900">{a.name}</span>
                    </div>
                  </Td>
                  <Td cls="text-gray-500 text-[11px]">{a.email}</Td>
                  <Td><TierBadge tier={a.tier}/></Td>
                  <Td right mono cls="text-gray-700">{a.agentCount}</Td>
                  <Td right mono cls="text-gray-700">${a.totalSpend.toFixed(2)}</Td>
                  <Td mono cls="text-gray-400 text-[10px]">{a.createdAt}</Td>
                  <Td>
                    {a.suspended ? <Pill label="停止中" variant="red"/> : <Pill label="有効" variant="green"/>}
                  </Td>
                  <Td>
                    <span onClick={e=>e.stopPropagation()}>
                      <Btn label={a.suspended?"停止解除":"利用停止"} color={a.suspended?"green":"red"} size="xs" onClick={()=>toggleSuspend(a.id)}/>
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Unified Monitoring page ───────────────────────────────────────────────────
function MonitoringPage({logs, setLogs, circuits, setCircuits}: {
  logs: LogEntry[]; setLogs: React.Dispatch<React.SetStateAction<LogEntry[]>>;
  circuits: CircuitEntry[]; setCircuits: React.Dispatch<React.SetStateAction<CircuitEntry[]>>;
}) {
  const [tab, setTab] = useState<MonitorTab>("all");
  const [halted, setHalted] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedLog, setExpandedLog] = useState<string|null>(null);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"}|null>(null);
  function showToast(msg:string, type:"success"|"error"|"info"="success") {
    setToast({msg,type});
    setTimeout(()=>setToast(null), 2500);
  }

  const filtered = logs.filter(l => {
    const matchTab = tab==="all" || l.level===tab;
    const matchSearch = !search || l.agentId.includes(search) || l.action.includes(search);
    return matchTab && matchSearch;
  });

  function resolve(id: string) {
    setLogs(prev => prev.map(l => l.id===id ? {...l, resolved:true} : l));
    showToast("解決済みとしてマークしました");
  }
  function resetCB(id: string) {
    setCircuits(prev => prev.map(c => c.id===id ? {...c, state:"closed", failures:0} : c));
    showToast("サーキットブレーカーをリセットしました");
  }

  const blockCount = logs.filter(l=>l.level==="block"&&!l.resolved).length;
  const warnCount  = logs.filter(l=>l.level==="warn" &&!l.resolved).length;

  return (
    <div className="space-y-5">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {/* Emergency halt */}
      <div className={`rounded-xl border p-4 flex items-center justify-between ${halted?"border-red-300 bg-red-50":"border-gray-200 bg-white"}`}>
        <div>
          <p className={`text-sm font-bold ${halted?"text-red-700":"text-gray-900"}`}>
            {halted ? "⚠ システム緊急停止中 — 全トランスファーが停止されています" : "緊急停止コントロール"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">全AIエージェントの送金処理を即時停止／再開します</p>
        </div>
        <button
          onClick={()=>setHalted(h=>!h)}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${halted?"bg-green-600 hover:bg-green-700 text-white":"bg-red-600 hover:bg-red-700 text-white"}`}
        >
          <Ico.Halt cls="w-4 h-4"/>
          {halted ? "システム再開" : "緊急停止"}
        </button>
      </div>

      {/* Circuit breakers */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">サーキットブレーカー</h3>
          <p className="text-xs text-gray-400 mt-0.5">エージェント間の異常通信を自動遮断するセーフガード</p>
        </div>
        <div className="divide-y divide-gray-50">
          {circuits.map(c=>(
            <div key={c.id} className={`flex items-center gap-4 px-4 py-3 ${c.state!=="closed"?"bg-red-50/40":""}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.state==="open"?"bg-red-500 animate-pulse":c.state==="half-open"?"bg-amber-400":"bg-green-400"}`}/>
              <span className="text-xs font-mono text-gray-700 flex-1">{c.pair}</span>
              <span className="text-[10px] text-gray-400">障害数: <span className="font-bold text-gray-700">{c.failures}/{c.threshold}</span></span>
              <span className="text-[10px] text-gray-400">最終: {c.lastTrip}</span>
              {c.state==="open" ? <Pill label="OPEN" variant="red"/> : c.state==="half-open" ? <Pill label="HALF-OPEN" variant="amber"/> : <Pill label="CLOSED" variant="green"/>}
              {c.state!=="closed" && <Btn label="リセット" color="gray" size="xs" onClick={()=>resetCB(c.id)}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Unified log */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900">統合ログ</h3>
            {blockCount>0 && <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{blockCount} BLOCK</span>}
            {warnCount>0  && <span className="px-2 py-0.5 rounded-full bg-amber-400 text-white text-[10px] font-bold">{warnCount} WARN</span>}
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="エージェント・アクションで絞り込み" className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-52"/>
            <div className="flex items-center gap-1">
              {(["all","warn","block"] as const).map(t=>(
                <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab===t?"bg-gray-900 text-white":"bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                  {t==="all"?"すべて":t==="warn"?"注意":"ブロック"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <table className="w-full">
          <thead><tr>
            <Th>日時</Th><Th>レベル</Th><Th>アクション</Th>
            <Th>エージェント</Th><Th right>金額</Th><Th right>リスク</Th><Th>状態</Th><Th>操作</Th>
          </tr></thead>
          <tbody>
            {filtered.slice(0,50).map(log=>{
              const isExpanded = expandedLog === log.id;
              const rowBg = log.level==="block"&&!log.resolved?"bg-red-50/30":log.level==="warn"&&!log.resolved?"bg-amber-50/30":"";
              return (
                <>
                  <tr key={log.id} className={`hover:bg-gray-50 transition-colors cursor-pointer ${rowBg} ${isExpanded?"border-b-0":""}`}
                    onClick={()=>setExpandedLog(isExpanded ? null : log.id)}>
                    <Td mono cls="text-gray-400 text-[10px] whitespace-nowrap">
                      <span className="mr-1 text-gray-300">{isExpanded?"▾":"▸"}</span>{log.ts}
                    </Td>
                    <Td>
                      {log.level==="block" ? <Pill label="BLOCK" variant="red"/> : log.level==="warn" ? <Pill label="WARN" variant="amber"/> : <Pill label="OK" variant="green"/>}
                    </Td>
                    <Td cls="font-mono text-[11px] text-gray-700">{log.action}</Td>
                    <Td mono cls="text-gray-500 text-[11px]">{log.agentId}</Td>
                    <Td right mono cls="text-gray-700">${log.amount.toFixed(4)}</Td>
                    <Td right>
                      <span className={`font-mono font-semibold text-xs ${log.riskScore>=70?"text-red-600":log.riskScore>=40?"text-amber-600":"text-green-600"}`}>{log.riskScore}</span>
                    </Td>
                    <Td>
                      {log.resolved ? <Pill label="解決済" variant="gray"/> : <Pill label="未解決" variant="red"/>}
                    </Td>
                    <Td>
                      {!log.resolved && log.level!=="normal" && (
                        <span onClick={e=>e.stopPropagation()}>
                          <Btn label="解決済みにする" color="gray" size="xs" onClick={()=>resolve(log.id)}/>
                        </span>
                      )}
                    </Td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${log.id}-detail`} className={`${rowBg}`}>
                      <td colSpan={8} className="px-4 pb-3 pt-0 border-b border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-3 font-mono text-[11px] text-gray-600 grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div><p className="text-[9px] text-gray-400 font-sans font-semibold uppercase tracking-wider mb-1">イベントID</p><p>{log.id}</p></div>
                          <div><p className="text-[9px] text-gray-400 font-sans font-semibold uppercase tracking-wider mb-1">通貨</p><p>{log.currency}</p></div>
                          <div><p className="text-[9px] text-gray-400 font-sans font-semibold uppercase tracking-wider mb-1">リスクスコア</p><p className={log.riskScore>=70?"text-red-600":log.riskScore>=40?"text-amber-600":"text-green-600"}>{log.riskScore} / 100</p></div>
                          <div><p className="text-[9px] text-gray-400 font-sans font-semibold uppercase tracking-wider mb-1">IPアドレス</p><p>192.168.{(log.riskScore*3)%254}.{(log.riskScore*7+1)%254}</p></div>
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-[9px] text-gray-400 font-sans font-semibold uppercase tracking-wider mb-1">ペイロード</p>
                            <p className="text-gray-500 break-all">{`{"event":"${log.action}","agent":"${log.agentId}","amount":${log.amount.toFixed(6)},"currency":"${log.currency}","risk":${log.riskScore},"ts":"${log.ts}"}`}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 50 && (
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
            {filtered.length - 50} 件を非表示 — フィルターを使って絞り込んでください
          </div>
        )}
      </div>
    </div>
  );
}

// ── Buyers Manage page ───────────────────────────────────────────────────────
interface BuyerRecord {
  id: string; name: string; email: string;
  balanceUsdc: string; kycTier: string; dailyLimitUsdc: string;
  suspended: boolean; createdAt: string;
}

type KycTier = "NONE" | "KYA" | "KYC";

const KYC_TIERS: KycTier[] = ["NONE", "KYA", "KYC"];
const KYC_LABEL: Record<KycTier, string> = { NONE: "未認証", KYA: "KYA", KYC: "KYC" };
const KYC_LIMIT: Record<KycTier, string> = { NONE: "$10/日", KYA: "$1,000/日", KYC: "$50,000/日" };
const KYC_BTN: Record<KycTier, string> = {
  NONE: "bg-gray-100 text-gray-600 border-gray-200",
  KYA:  "bg-violet-50 text-violet-700 border-violet-200",
  KYC:  "bg-sky-50 text-sky-700 border-sky-200",
};
const KYC_BTN_ACTIVE: Record<KycTier, string> = {
  NONE: "bg-gray-700 text-white border-gray-700",
  KYA:  "bg-violet-600 text-white border-violet-600",
  KYC:  "bg-sky-600 text-white border-sky-600",
};

function BuyersManagePage({ token }: { token: string }) {
  const [buyers,      setBuyers]      = useState<BuyerRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [deposit,     setDeposit]     = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState<string | null>(null);   // buyerId for deposit
  const [kycSaving,   setKycSaving]   = useState<string | null>(null);   // buyerId for kyc
  const [msg,         setMsg]         = useState<Record<string, string>>({});

  function load() {
    setLoading(true); setError("");
    fetch(`${API_URL}/api/buyers`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((data: BuyerRecord[]) => setBuyers(data))
      .catch(() => setError("Buyerの取得に失敗しました"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeposit(buyerId: string) {
    const amt = parseFloat(deposit[buyerId] ?? "0");
    if (!amt || amt <= 0) return;
    setSaving(buyerId); setMsg(p => ({ ...p, [buyerId]: "" }));
    try {
      const res = await fetch(`${API_URL}/api/buyers/${buyerId}/deposit`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ amountUsdc: amt }),
      });
      if (!res.ok) throw new Error("チャージに失敗しました");
      const updated: BuyerRecord = await res.json();
      setBuyers(p => p.map(b => b.id === buyerId ? { ...b, balanceUsdc: updated.balanceUsdc } : b));
      setDeposit(p => ({ ...p, [buyerId]: "" }));
      setMsg(p => ({ ...p, [buyerId]: `✓ ${amt} USDC チャージ完了` }));
      setTimeout(() => setMsg(p => ({ ...p, [buyerId]: "" })), 3000);
    } catch {
      setMsg(p => ({ ...p, [buyerId]: "チャージ失敗" }));
    } finally {
      setSaving(null);
    }
  }

  async function handleKyc(buyerId: string, tier: KycTier) {
    setKycSaving(buyerId); setMsg(p => ({ ...p, [`kyc_${buyerId}`]: "" }));
    try {
      const res = await fetch(`${API_URL}/api/buyers/${buyerId}/kyc`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ kycTier: tier }),
      });
      if (!res.ok) throw new Error("変更に失敗しました");
      const updated: BuyerRecord = await res.json();
      setBuyers(p => p.map(b => b.id === buyerId ? { ...b, kycTier: updated.kycTier, dailyLimitUsdc: updated.dailyLimitUsdc } : b));
      setMsg(p => ({ ...p, [`kyc_${buyerId}`]: `✓ ${KYC_LABEL[tier]} に変更` }));
      setTimeout(() => setMsg(p => ({ ...p, [`kyc_${buyerId}`]: "" })), 2500);
    } catch {
      setMsg(p => ({ ...p, [`kyc_${buyerId}`]: "変更失敗" }));
    } finally {
      setKycSaving(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">登録Buyer一覧</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{buyers.length} 件</span>
            <button onClick={load} className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 border border-gray-200 rounded-lg transition-colors">更新</button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">読み込み中…</div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-500">{error}</div>
        ) : buyers.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Buyerが登録されていません</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {buyers.map(b => {
              const currentTier = (b.kycTier ?? "NONE") as KycTier;
              return (
                <div key={b.id} className="px-6 py-4 flex flex-col gap-3">
                  {/* Row 1: 基本情報 + 残高 */}
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0">
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                      <p className="text-xs text-gray-400 truncate">{b.email}</p>
                    </div>
                    {/* 残高 */}
                    <div className="text-right flex-shrink-0 w-28">
                      <p className="text-xs text-gray-400">USDC残高</p>
                      <p className="text-sm font-bold font-mono text-gray-900">{parseFloat(b.balanceUsdc).toFixed(4)}</p>
                    </div>
                    {/* チャージ入力 */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <input
                        type="number" min="0.01" step="0.01" placeholder="10.00"
                        value={deposit[b.id] ?? ""}
                        onChange={e => setDeposit(p => ({ ...p, [b.id]: e.target.value }))}
                        className="w-24 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                      />
                      <button
                        onClick={() => handleDeposit(b.id)}
                        disabled={saving === b.id || !deposit[b.id]}
                        className="px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        {saving === b.id ? "…" : "チャージ"}
                      </button>
                      {msg[b.id] && (
                        <span className={`text-xs whitespace-nowrap ${msg[b.id].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                          {msg[b.id]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: KYCティア変更 */}
                  <div className="flex items-center gap-3 pl-[52px]">
                    <span className="text-[10px] text-gray-400 w-16 flex-shrink-0">KYCティア</span>
                    <div className="flex items-center gap-1.5">
                      {KYC_TIERS.map(tier => {
                        const isActive = currentTier === tier;
                        const isLoading = kycSaving === b.id;
                        return (
                          <button
                            key={tier}
                            onClick={() => !isActive && !isLoading && handleKyc(b.id, tier)}
                            disabled={isActive || isLoading}
                            title={`${KYC_LABEL[tier]}（${KYC_LIMIT[tier]}）`}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              isActive
                                ? KYC_BTN_ACTIVE[tier] + " cursor-default shadow-sm"
                                : KYC_BTN[tier] + " hover:opacity-80 cursor-pointer"
                            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {isLoading && !isActive ? "…" : KYC_LABEL[tier]}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-gray-400">
                      上限: <span className="font-semibold text-gray-600">{KYC_LIMIT[currentTier]}</span>
                    </span>
                    {msg[`kyc_${b.id}`] && (
                      <span className={`text-[10px] whitespace-nowrap ${msg[`kyc_${b.id}`].startsWith("✓") ? "text-green-600" : "text-red-500"}`}>
                        {msg[`kyc_${b.id}`]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── JPYC Review Page ──────────────────────────────────────────────────────────
interface JpycDepositItem {
  id: string; buyerId: string; buyerName?: string; buyerEmail?: string;
  txHash: string; amountJpyc: string; amountUsdc: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null; reviewedAt: string | null; createdAt: string;
}

function JpycReviewPage({ token }: { token: string }) {
  const [requests, setRequests]       = useState<JpycDepositItem[]>([]);
  const [loading,  setLoading]        = useState(true);
  const [filter,   setFilter]         = useState<"" | "PENDING" | "APPROVED" | "REJECTED">("");
  const [reviewing, setReviewing]     = useState<string | null>(null);
  const [usdcInput, setUsdcInput]     = useState<Record<string, string>>({});
  const [noteInput, setNoteInput]     = useState<Record<string, string>>({});
  const [rowMsg,    setRowMsg]        = useState<Record<string, {ok:boolean; msg:string}>>({});

  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  function load() {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    fetch(`${API_URL}/api/jpyc/deposits/all${qs}&limit=50`, { headers: hdrs })
      .then(r => r.json())
      .then(d => setRequests((d as {data: JpycDepositItem[]}).data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReview(id: string, status: "APPROVED" | "REJECTED") {
    setReviewing(id);
    setRowMsg(prev => ({ ...prev, [id]: { ok: false, msg: "" } }));
    try {
      const body: Record<string, string> = { status };
      if (status === "APPROVED" && usdcInput[id]) body.amountUsdc = usdcInput[id];
      if (noteInput[id]) body.reviewNote = noteInput[id];

      const res = await fetch(`${API_URL}/api/jpyc/deposits/${id}/review`, {
        method: "PATCH", headers: hdrs, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "審査に失敗しました");
      setRowMsg(prev => ({ ...prev, [id]: { ok: true, msg: status === "APPROVED" ? "承認しました" : "却下しました" } }));
      load();
    } catch (err: unknown) {
      setRowMsg(prev => ({ ...prev, [id]: { ok: false, msg: err instanceof Error ? err.message : "エラー" } }));
    } finally {
      setReviewing(null);
    }
  }

  const statusBadge = (s: "PENDING" | "APPROVED" | "REJECTED") => {
    if (s === "PENDING")  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 border border-amber-200 text-amber-700">審査中</span>;
    if (s === "APPROVED") return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 border border-green-200 text-green-700">承認済み</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 border border-red-200 text-red-700">却下</span>;
  };

  const jpycRate = 150; // same as API default

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3">
        <span className="text-sm font-semibold text-gray-700">ステータス絞り込み:</span>
        {(["", "PENDING", "APPROVED", "REJECTED"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}>
            {s === "" ? "すべて" : s === "PENDING" ? "審査中" : s === "APPROVED" ? "承認済み" : "却下"}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1">更新</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">
            JPYCチャージ申請一覧
            {!loading && <span className="ml-2 text-xs text-gray-400 font-normal">{requests.length}件</span>}
          </span>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">読み込み中…</div>
        ) : requests.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">申請がありません</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map(r => (
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {statusBadge(r.status)}
                      <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString("ja-JP")}</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">{r.buyerName ?? r.buyerId}</span>
                      {r.buyerEmail && <span className="text-gray-400 ml-1">({r.buyerEmail})</span>}
                    </p>
                    <p className="font-mono text-[10px] text-gray-400 truncate mt-0.5">{r.txHash}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-1">
                      {parseFloat(r.amountJpyc).toLocaleString()} JPYC
                      <span className="text-gray-400 text-xs font-normal ml-1">
                        (換算目安: {(parseFloat(r.amountJpyc) / jpycRate).toFixed(4)} USDC)
                      </span>
                      {r.amountUsdc && (
                        <span className="text-green-600 text-xs font-normal ml-1">→ 付与: {parseFloat(r.amountUsdc).toFixed(4)} USDC</span>
                      )}
                    </p>
                    {r.reviewNote && (
                      <p className="text-xs text-gray-500 mt-1">メモ: {r.reviewNote}</p>
                    )}
                  </div>

                  {/* Action area */}
                  {r.status === "PENDING" && (
                    <div className="flex flex-col gap-2 min-w-[200px]">
                      <input
                        type="number"
                        value={usdcInput[r.id] ?? ""}
                        onChange={e => setUsdcInput(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder={`USDC金額（省略時: ${(parseFloat(r.amountJpyc) / jpycRate).toFixed(4)}）`}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                        step="0.0001"
                      />
                      <input
                        type="text"
                        value={noteInput[r.id] ?? ""}
                        onChange={e => setNoteInput(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="審査メモ（任意）"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(r.id, "APPROVED")}
                          disabled={reviewing === r.id}
                          className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >承認</button>
                        <button
                          onClick={() => handleReview(r.id, "REJECTED")}
                          disabled={reviewing === r.id}
                          className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >却下</button>
                      </div>
                      {rowMsg[r.id]?.msg && (
                        <p className={`text-[10px] text-center ${rowMsg[r.id].ok ? "text-green-600" : "text-red-500"}`}>
                          {rowMsg[r.id].msg}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Finance & System page ─────────────────────────────────────────────────────
function FinancePage() {
  const [fee, setFee] = useState("2.5");
  const [maxTx, setMaxTx] = useState("10000");
  const [settlements, setSettlements] = useState<typeof DEMO_SETTLEMENTS[0][]>([]);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"}|null>(null);

  function markPaid(id: string) {
    setSettlements(prev => prev.map(s => s.id===id ? {...s, status:"paid"} : s));
    setToast({msg:"精算を実行しました", type:"success"});
    setTimeout(()=>setToast(null), 2500);
  }

  function saveParams() {
    setSaved(true);
    setToast({msg:"システムパラメーターを保存しました", type:"success"});
    setTimeout(()=>{ setSaved(false); setToast(null); }, 2500);
  }

  const totalPending = settlements.filter(s=>s.status==="pending").reduce((a,b)=>a+b.amount,0);
  const totalPaid    = settlements.filter(s=>s.status==="paid").reduce((a,b)=>a+b.amount,0);

  return (
    <div className="space-y-6">
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="精算待ち総額" value={`$${totalPending.toFixed(2)}`} color="amber" delta={`${settlements.filter(s=>s.status==="pending").length}プロバイダー`}/>
        <KpiCard label="精算済み総額（今月）" value={`$${totalPaid.toFixed(2)}`} color="green"/>
        <KpiCard label="プラットフォーム手数料収入" value={`$${(totalPaid * parseFloat(fee)/100).toFixed(2)}`} color="blue" delta={`手数料率 ${fee}%`}/>
      </div>

      {/* Settlements */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">プロバイダー精算</h3>
          <p className="text-xs text-gray-400 mt-0.5">各プロバイダーへの売上精算ステータス</p>
        </div>
        <table className="w-full">
          <thead><tr><Th>プロバイダー</Th><Th>対象期間</Th><Th right>精算額</Th><Th>通貨</Th><Th>期日</Th><Th>ステータス</Th><Th>操作</Th></tr></thead>
          <tbody>
            {settlements.map(s=>(
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <Td cls="font-semibold text-gray-900">{s.provider}</Td>
                <Td cls="text-gray-500 text-[11px]">{s.period}</Td>
                <Td right mono cls="text-gray-900 font-bold">${s.amount.toFixed(2)}</Td>
                <Td><span className="font-mono text-[10px] text-gray-500">{s.currency}</span></Td>
                <Td mono cls="text-gray-400 text-[10px]">{s.dueAt}</Td>
                <Td>
                  {s.status==="pending" ? <Pill label="未精算" variant="amber"/> : <Pill label="精算済" variant="green"/>}
                </Td>
                <Td>
                  {s.status==="pending" && <Btn label="精算実行" color="green" size="xs" onClick={()=>markPaid(s.id)}/>}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* System params */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-bold text-gray-900">システムパラメーター</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">プラットフォーム手数料率 (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={fee} onChange={e=>setFee(e.target.value)} step="0.1" min="0" max="10"
                className="w-28 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"/>
              <span className="text-xs text-gray-400">現在: {fee}% / 取引</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">1取引あたり上限額 (USDC)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={maxTx} onChange={e=>setMaxTx(e.target.value)} step="100" min="100"
                className="w-28 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono"/>
              <span className="text-xs text-gray-400">USDC 上限</span>
            </div>
          </div>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <button onClick={saveParams} className={`px-4 py-2 text-white text-sm font-semibold rounded-lg transition-all ${saved?"bg-green-600 hover:bg-green-700":"bg-gray-900 hover:bg-gray-800"}`}>
            {saved ? "✓ 保存しました" : "変更を保存"}
          </button>
          {saved && <span className="text-xs text-green-600 font-medium">設定が反映されました</span>}
        </div>
      </div>
    </div>
  );
}

// ── Admin Sidebar ─────────────────────────────────────────────────────────────
const NAV: {id:NavSection; label:string; sub:string; Icon: ({cls}:{cls?:string})=>React.JSX.Element}[] = [
  { id:"overview",    label:"概要",                 sub:"Dashboard",           Icon: Ico.Overview    },
  { id:"marketplace", label:"マーケットプレイス運営", sub:"Marketplace & Users", Icon: Ico.Marketplace },
  { id:"buyers",      label:"Buyer管理",             sub:"残高・KYC管理",        Icon: Ico.User        },
  { id:"jpyc",        label:"JPYCチャージ審査",       sub:"JPYC Deposit Review", Icon: Ico.Finance     },
  { id:"monitoring",  label:"オペレーション監視",     sub:"Operations & Risk",   Icon: Ico.Monitor     },
  { id:"finance",     label:"財務・設定",             sub:"Finance & System",    Icon: Ico.Finance     },
];

function AdminSidebar({nav, setNav, openFlags, pendingSvc}: {nav:NavSection; setNav:(n:NavSection)=>void; openFlags:number; pendingSvc:number}) {
  return (
    <aside className="w-60 h-screen flex flex-col bg-white border-r border-gray-200 flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="LEMON cake" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
          <div>
            <p className="text-gray-900 text-[13px] font-bold leading-tight">LEMON cake</p>
            <p className="text-gray-400 text-[10px]">Admin Console</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map(item => {
          const badge = item.id==="marketplace"?pendingSvc : item.id==="monitoring"?openFlags : 0;
          const active = nav === item.id;
          return (
            <button key={item.id} onClick={()=>setNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${active?"bg-gray-100 text-gray-900":"text-gray-500 hover:bg-gray-50 hover:text-gray-800"}`}>
              <item.Icon cls={`w-5 h-5 flex-shrink-0 ${active?"text-gray-900":"text-gray-400 group-hover:text-gray-600"}`}/>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold leading-tight ${active?"text-gray-900":"text-gray-600"}`}>{item.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
              </div>
              {badge > 0 && (
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${item.id==="monitoring"&&openFlags>0?"bg-red-500 text-white":"bg-amber-400 text-gray-900"}`}>{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-gray-100">
        <a href="/" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 transition-colors text-xs">
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><path d="M10 3L5 8l5 5"/></svg>
          購入者ダッシュボードへ
        </a>
      </div>
    </aside>
  );
}

// ── Page titles & descriptions ────────────────────────────────────────────────
const PAGE_META: Record<NavSection, {title:string; desc:string}> = {
  overview:    { title:"概要",                 desc:"システム全体のKPIと要対応タスクの確認" },
  marketplace: { title:"マーケットプレイス運営", desc:"サービス審査・Verified付与・アカウント管理" },
  buyers:      { title:"Buyer管理",             desc:"登録Buyer一覧・USDC残高チャージ・KYC管理" },
  jpyc:        { title:"JPYCチャージ審査",       desc:"JPYCステーブルコインによる残高チャージ申請の承認・却下" },
  monitoring:  { title:"オペレーション監視",     desc:"統合ログ・リスクフラグ・サーキットブレーカー" },
  finance:     { title:"財務・設定",             desc:"プロバイダー精算・手数料・システムパラメーター" },
};

// ── localStorage persistence helper ──────────────────────────────────────────
function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AdminRoot() {
  const [nav, setNav] = useState<NavSection>("overview");
  const [clock, setClock] = useState("--:--:--");
  const [services,  setServices]  = useState<ServiceType[]>([]);
  const [accounts,  setAccounts]  = useState<AccountType[]>([]);
  const [logs,      setLogs]      = useState<LogEntry[]>([]);
  const [circuits,  setCircuits]  = useState<CircuitEntry[]>([]);
  const [token,     setToken]     = useState<string>("");
  const [authReady, setAuthReady] = useState(false);

  const canSave = useRef(false);

  // 認証チェック: localStorage からトークン取得、なければログインへ
  useEffect(() => {
    const stored = localStorage.getItem("admin_token");
    if (!stored) {
      window.location.href = "/admin/login";
      return;
    }
    setToken(stored);
    setAuthReady(true);
  }, []);

  // サービス: APIから取得（認証後のみ）
  useEffect(() => {
    if (!authReady) return;
    fetch(`${API_URL}/api/services`)
      .then((r) => r.json())
      .then((data: ApiServiceRaw[]) => {
        if (Array.isArray(data)) setServices(data.map(mapApiService));
      })
      .catch(() => setServices([]));
  }, [authReady]);

  useEffect(() => {
    // accounts/logs/circuits は localStorage から復元
    setAccounts( load("admin_accounts", []) );
    setLogs(     load("admin_logs",     []) );
    setCircuits( load("admin_circuits", []) );
    const t = setTimeout(() => { canSave.current = true; }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { if (canSave.current) localStorage.setItem("admin_accounts", JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { if (canSave.current) localStorage.setItem("admin_logs",     JSON.stringify(logs));     }, [logs]);
  useEffect(() => { if (canSave.current) localStorage.setItem("admin_circuits", JSON.stringify(circuits)); }, [circuits]);

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString("ja-JP", {hour12:false})), 1000);
    return () => clearInterval(t);
  }, []);

  const openFlags  = logs.filter(l=>!l.resolved&&l.level!=="normal").length;
  const pendingSvc = services.filter(s=>s.reviewStatus==="pending").length;
  const meta = PAGE_META[nav];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar nav={nav} setNav={setNav} openFlags={openFlags} pendingSvc={pendingSvc}/>

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-7 py-4 flex-shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900">{meta.title}</h1>
            <p className="text-xs text-gray-400 mt-0.5">{meta.desc}</p>
          </div>
          <div className="flex items-center gap-4">
            {openFlags > 0 && (
              <button onClick={()=>setNav("monitoring")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors">
                <Ico.Alert cls="w-3.5 h-3.5"/>
                {openFlags}件のアラート
              </button>
            )}
            <span className="font-mono text-xs text-gray-400 tabular-nums">{clock}</span>
            <button
              onClick={() => { localStorage.removeItem("admin_token"); window.location.href = "/admin/login"; }}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {nav === "overview"    && <OverviewPage setNav={setNav} services={services} logs={logs} circuits={circuits} accounts={accounts}/>}
          {nav === "marketplace" && <MarketplacePage services={services} setServices={setServices} accounts={accounts} setAccounts={setAccounts} token={token}/>}
          {nav === "buyers"      && <BuyersManagePage token={token}/>}
          {nav === "jpyc"        && <JpycReviewPage token={token}/>}
          {nav === "monitoring"  && <MonitoringPage logs={logs} setLogs={setLogs} circuits={circuits} setCircuits={setCircuits}/>}
          {nav === "finance"     && <FinancePage/>}
        </div>
      </main>
    </div>
  );
}
