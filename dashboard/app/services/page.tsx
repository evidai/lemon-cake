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
  // ─── Marketplace meta（DB） ─────────────────────────────────
  description?:      string | null;
  longDescription?:  string | null;
  category?:         string | null;
  tags?:             string[];
  iconEmoji?:        string | null;
  useCases?:         string[];
  samplePath?:       string | null;
  sampleMethod?:     string | null;
  documentationUrl?: string | null;
}

const CATEGORY_ORDER = ["検索", "Web取得", "営業/B2B", "金融", "日本特化", "通知", "本人確認", "ドキュメント", "データ", "テスト", "その他"];

const categoryColors: Record<string, string> = {
  "検索":         "bg-blue-50 text-blue-700 border-blue-100",
  "Web取得":      "bg-purple-50 text-purple-700 border-purple-100",
  "営業/B2B":     "bg-pink-50 text-pink-700 border-pink-100",
  "金融":         "bg-green-50 text-green-700 border-green-100",
  "日本特化":     "bg-rose-50 text-rose-700 border-rose-100",
  "通知":         "bg-amber-50 text-amber-700 border-amber-100",
  "本人確認":     "bg-cyan-50 text-cyan-700 border-cyan-100",
  "ドキュメント": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "データ":       "bg-teal-50 text-teal-700 border-teal-100",
  "テスト":       "bg-gray-100 text-gray-600 border-gray-200",
  "その他":       "bg-gray-100 text-gray-600 border-gray-200",
};

const categoryFallbackEmoji: Record<string, string> = {
  "検索": "🔍", "Web取得": "🕸️", "営業/B2B": "✉️", "金融": "💱",
  "日本特化": "🇯🇵", "通知": "💬", "本人確認": "🪪", "ドキュメント": "📝",
  "データ": "🌐", "テスト": "🧪", "その他": "📦",
};

// 落ちにくい viewmodel に整形（DB の meta が無いサービスでも壊れない）
function viewmodel(s: ApiService) {
  const category    = s.category    ?? "その他";
  const iconEmoji   = s.iconEmoji   ?? categoryFallbackEmoji[category] ?? "📦";
  const description = s.description ?? "";
  const tags        = s.tags        ?? [];
  return { ...s, category, iconEmoji, description, tags };
}

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

  const enriched = useMemo(() => services.map(viewmodel), [services]);
  const categories = useMemo(() => {
    const set = new Set(enriched.map(s => s.category));
    return CATEGORY_ORDER.filter(c => set.has(c));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter(s => {
      if (filter !== "ALL" && s.category !== filter) return false;
      if (search) {
        const hay = `${s.name} ${s.providerName} ${s.tags.join(" ")} ${s.description} ${s.longDescription ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-4 sm:mb-6 inline-block">← LemonCake</Link>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 sm:mb-3">利用可能なサービス</h1>
              <p className="text-sm sm:text-base text-gray-500 max-w-2xl">
                AI エージェントが <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">ALL</code> スコープの Pay Token で自律課金できる、稼働中のサービス一覧です。各カードをタップで詳細・サンプルコード。
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">{services.length}</div>
              <div className="text-xs text-gray-400 mt-1">稼働中サービス</div>
            </div>
          </div>
          <div className="mt-4 sm:mt-6 flex gap-3 flex-wrap">
            <Link href="/dashboard" className="px-4 py-2 bg-yellow-300 text-gray-900 text-sm font-semibold rounded-xl hover:bg-yellow-400 transition-colors">
              Pay Token を発行する →
            </Link>
            <Link href="/about" className="px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:border-gray-400 transition-colors">
              仕組みを知る
            </Link>
          </div>
        </div>
      </div>

      {/* Filter bar — sticky on scroll */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="サービス名・タグ・用途で検索…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          />
          <div className="flex gap-1 overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10 sm:space-y-12">
        {loading && (
          <div className="text-center text-gray-400 py-12">読み込み中…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-400 py-12">該当するサービスがありません</div>
        )}
        {grouped.map(({ cat, services }) => (
          <section key={cat}>
            <div className="flex items-baseline justify-between mb-3 sm:mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{cat}</h2>
              <span className="text-[11px] text-gray-400">{services.length} 件</span>
            </div>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
              {services.map((svc) => (
                <Link
                  key={svc.id}
                  href={`/services/${svc.id}`}
                  className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 hover:border-gray-400 hover:shadow-md transition-all block group"
                >
                  {/* Header: icon + name + category badge */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-xl sm:text-2xl select-none">
                      {svc.iconEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 leading-tight group-hover:text-gray-700 transition-colors">{svc.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{svc.providerName}</p>
                    </div>
                    <span className={`text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-1 rounded-full whitespace-nowrap border ${categoryColors[svc.category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {svc.category}
                    </span>
                  </div>

                  {/* Description */}
                  {svc.description ? (
                    <p className="text-sm text-gray-600 mb-3 sm:mb-4 leading-relaxed line-clamp-2">{svc.description}</p>
                  ) : (
                    <p className="text-sm text-gray-300 italic mb-3 sm:mb-4">説明文未設定</p>
                  )}

                  {/* Use cases — first 2 if present */}
                  {svc.useCases && svc.useCases.length > 0 && (
                    <ul className="text-[11px] text-gray-500 mb-3 sm:mb-4 space-y-1">
                      {svc.useCases.slice(0, 2).map((uc, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-gray-300 mt-0.5">•</span>
                          <span className="line-clamp-1">{uc}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Footer: tags + price */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-50">
                    <div className="flex gap-1 flex-wrap min-w-0">
                      {svc.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] bg-gray-50 text-gray-500 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">{t}</span>
                      ))}
                      {svc.tags.length > 3 && (
                        <span className="text-[10px] text-gray-300 px-1 py-0.5">+{svc.tags.length - 3}</span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-semibold text-gray-900 whitespace-nowrap">
                      ${parseFloat(svc.pricePerCallUsdc).toFixed(4)}<span className="text-gray-400 font-normal text-xs">/call</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {/* CTA */}
        <div className="bg-gray-900 rounded-2xl p-6 sm:p-8 text-center">
          <p className="text-white font-semibold text-base sm:text-lg mb-2">自分のサービスを登録したい？</p>
          <p className="text-gray-400 text-sm mb-6">Seller として登録すると、あなたの API を AI エージェントに販売できます。</p>
          <Link href="/register" className="px-6 py-3 bg-yellow-300 text-gray-900 text-sm font-semibold rounded-xl hover:bg-yellow-400 transition-colors inline-block">
            Seller 登録する
          </Link>
        </div>
      </div>
    </main>
  );
}
