"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.lemoncake.xyz";

interface ApiService {
  id:               string;
  providerName:     string;
  name:             string;
  type:             "API" | "MCP";
  pricePerCallUsdc: string;
  reviewStatus:     "PENDING" | "APPROVED" | "REJECTED";
  verified:         boolean;
}

// サービス名から推定するカテゴリと説明 (実 DB に description フィールドが無いため UI 側で補完)
function inferMeta(name: string): { category: string; tags: string[]; description: string } {
  const n = name.toLowerCase();
  if (n.includes("serper") || n.includes("search") || n.includes("tavily") || n.includes("exa"))
    return { category: "検索", tags: ["Web検索", "リアルタイム"], description: "Google 検索結果を構造化 JSON で取得 (organic / news / images)" };
  if (n.includes("hunter"))
    return { category: "営業/B2B", tags: ["メール発掘", "コンタクト"], description: "ドメインから企業の連絡先メールアドレスを発掘 (役職・信頼度付き)" };
  if (n.includes("jina") || n.includes("firecrawl"))
    return { category: "Web取得", tags: ["スクレイピング", "LLM-ready"], description: "任意の URL を LLM が読みやすい Markdown / clean text に変換" };
  if (n.includes("ipinfo"))
    return { category: "データ", tags: ["IP", "geolocation"], description: "IP アドレスの地理情報・ISP・リスクスコア取得" };
  if (n.includes("exchange") || n.includes("為替"))
    return { category: "金融", tags: ["為替", "USD/JPY"], description: "リアルタイム為替レート (170+ 通貨)" };
  if (n.includes("slack"))
    return { category: "通知", tags: ["Slack", "HITL"], description: "エージェントが Slack に承認依頼を投稿、人間判断を待つ" };
  if (n.includes("gbiz") || n.includes("法人"))
    return { category: "日本特化", tags: ["法人情報", "政府"], description: "経済産業省 gBizINFO の企業データベース照会 (法人番号→詳細)" };
  if (n.includes("インボイス") || n.includes("invoice"))
    return { category: "日本特化", tags: ["税務", "適格請求書"], description: "国税庁の適格請求書発行事業者番号を照合" };
  if (n.includes("e-gov") || n.includes("法令"))
    return { category: "日本特化", tags: ["法令", "政府"], description: "e-Gov 法令データから日本の法律・政令を全文検索" };
  if (n.includes("vat") || n.includes("abstract"))
    return { category: "金融", tags: ["VAT", "EU"], description: "EU VAT 番号の有効性検証 (VIES)" };
  if (n.includes("trustdock") || n.includes("ekyc"))
    return { category: "本人確認", tags: ["KYC", "ID"], description: "オンライン本人確認 (eKYC) の自動化" };
  if (n.includes("cloudsign"))
    return { category: "ドキュメント", tags: ["電子契約", "署名"], description: "クラウドサイン: 電子契約の作成・送信" };
  if (n.includes("raksul"))
    return { category: "ドキュメント", tags: ["印刷", "発注"], description: "ラクスル印刷の発注 API" };
  if (n.includes("coze") || n.includes("test"))
    return { category: "テスト", tags: ["echo", "デバッグ"], description: "リクエストをそのまま 200 で返すテスト用エンドポイント" };
  return { category: "その他", tags: [], description: "" };
}

const CATEGORY_ORDER = ["検索", "Web取得", "営業/B2B", "金融", "日本特化", "通知", "本人確認", "ドキュメント", "データ", "テスト", "その他"];

const categoryColors: Record<string, string> = {
  "検索":         "bg-blue-50 text-blue-700",
  "Web取得":      "bg-purple-50 text-purple-700",
  "営業/B2B":     "bg-pink-50 text-pink-700",
  "金融":         "bg-green-50 text-green-700",
  "日本特化":     "bg-rose-50 text-rose-700",
  "通知":         "bg-amber-50 text-amber-700",
  "本人確認":     "bg-cyan-50 text-cyan-700",
  "ドキュメント": "bg-indigo-50 text-indigo-700",
  "データ":       "bg-teal-50 text-teal-700",
  "テスト":       "bg-gray-100 text-gray-600",
  "その他":       "bg-gray-100 text-gray-600",
};

export default function ServicesPage() {
  const [services, setServices] = useState<ApiService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<string>("ALL");

  useEffect(() => {
    fetch(`${API_URL}/api/services?reviewStatus=APPROVED&limit=100`)
      .then(r => r.json())
      .then((data: ApiService[]) => {
        setServices((data ?? []).filter(s => s.verified));
      })
      .catch(e => console.error("[ServicesPage]", e))
      .finally(() => setLoading(false));
  }, []);

  const enriched = useMemo(() => services.map(s => ({ ...s, ...inferMeta(s.name) })), [services]);
  const categories = useMemo(() => {
    const set = new Set(enriched.map(s => s.category));
    return CATEGORY_ORDER.filter(c => set.has(c));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter(s => {
      if (filter !== "ALL" && s.category !== filter) return false;
      if (search && !`${s.name} ${s.providerName} ${s.tags.join(" ")} ${s.description}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [enriched, filter, search]);

  const grouped = useMemo(() => {
    const out: Array<{ cat: string; services: typeof filtered }> = [];
    for (const c of categories) {
      const items = filtered.filter(s => s.category === c);
      if (items.length) out.push({ cat: c, services: items });
    }
    return out;
  }, [filtered, categories]);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← LemonCake</Link>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">利用可能なサービス</h1>
              <p className="text-gray-500 max-w-2xl">
                AI エージェントが <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">ALL</code> スコープの Pay Token で自律課金できる、稼働中のサービス一覧です。
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900 tabular-nums">{services.length}</div>
              <div className="text-xs text-gray-400 mt-1">稼働中サービス</div>
            </div>
          </div>
          <div className="mt-6 flex gap-3 flex-wrap">
            <Link href="/dashboard" className="px-4 py-2 bg-yellow-300 text-gray-900 text-sm font-semibold rounded-xl hover:bg-yellow-400 transition-colors">
              Pay Token を発行する →
            </Link>
            <Link href="/about" className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-400 transition-colors">
              仕組みを知る
            </Link>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="サービス名・タグで検索…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          />
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${filter === "ALL" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              すべて ({enriched.length})
            </button>
            {categories.map(c => {
              const count = enriched.filter(s => s.category === c).length;
              return (
                <button key={c} onClick={() => setFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${filter === c ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {c} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Service grid */}
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {loading && (
          <div className="text-center text-gray-400 py-12">読み込み中…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-400 py-12">該当するサービスがありません</div>
        )}
        {grouped.map(({ cat, services }) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((svc) => (
                <div key={svc.id} className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{svc.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{svc.providerName}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${categoryColors[svc.category] ?? "bg-gray-100 text-gray-600"}`}>
                      {svc.category}
                    </span>
                  </div>
                  {svc.description && <p className="text-sm text-gray-600 mb-4 leading-relaxed">{svc.description}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 flex-wrap">
                      {svc.tags.map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      ${parseFloat(svc.pricePerCallUsdc).toFixed(4)}<span className="text-gray-400 font-normal text-xs">/call</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* CTA */}
        <div className="bg-gray-900 rounded-2xl p-8 text-center">
          <p className="text-white font-semibold text-lg mb-2">自分のサービスを登録したい？</p>
          <p className="text-gray-400 text-sm mb-6">Seller として登録すると、あなたの API を AI エージェントに販売できます。</p>
          <Link href="/register" className="px-6 py-3 bg-yellow-300 text-gray-900 text-sm font-semibold rounded-xl hover:bg-yellow-400 transition-colors inline-block">
            Seller 登録する
          </Link>
        </div>
      </div>
    </main>
  );
}
