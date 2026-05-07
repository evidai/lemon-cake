"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.lemoncake.xyz";

interface ApiService {
  id:               string;
  providerName:     string;
  name:             string;
  type:             "API" | "MCP";
  pricePerCallUsdc: string;
  reviewStatus:     string;
  verified:         boolean;
  description?:      string | null;
  longDescription?:  string | null;
  category?:         string | null;
  tags?:             string[];
  iconEmoji?:        string | null;
  useCases?:         string[];
  samplePath?:       string | null;
  sampleMethod?:     string | null;
  sampleBody?:       unknown;
  documentationUrl?: string | null;
}

const categoryFallbackEmoji: Record<string, string> = {
  "検索": "🔍", "Web取得": "🕸️", "営業/B2B": "✉️", "金融": "💱",
  "日本特化": "🇯🇵", "通知": "💬", "本人確認": "🪪", "ドキュメント": "📝",
  "データ": "🌐", "テスト": "🧪", "その他": "📦",
};

const categoryColors: Record<string, string> = {
  "検索": "bg-blue-50 text-blue-700 border-blue-100",
  "Web取得": "bg-purple-50 text-purple-700 border-purple-100",
  "営業/B2B": "bg-pink-50 text-pink-700 border-pink-100",
  "金融": "bg-green-50 text-green-700 border-green-100",
  "日本特化": "bg-rose-50 text-rose-700 border-rose-100",
  "通知": "bg-amber-50 text-amber-700 border-amber-100",
  "本人確認": "bg-cyan-50 text-cyan-700 border-cyan-100",
  "ドキュメント": "bg-indigo-50 text-indigo-700 border-indigo-100",
  "データ": "bg-teal-50 text-teal-700 border-teal-100",
  "テスト": "bg-gray-100 text-gray-600 border-gray-200",
  "その他": "bg-gray-100 text-gray-600 border-gray-200",
};

export default function ServiceDetailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const [service, setService] = useState<ApiService | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_URL}/api/services?reviewStatus=APPROVED&limit=100`)
      .then(r => r.json())
      .then((data: ApiService[]) => {
        const s = data.find(x => x.id === id && x.verified);
        if (s) setService(s);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <main className="min-h-screen bg-gray-50 grid place-items-center text-gray-400">読み込み中…</main>;
  if (notFound || !service) return (
    <main className="min-h-screen bg-gray-50 grid place-items-center text-gray-400">
      <div className="text-center">
        <p className="text-lg font-semibold mb-2">サービスが見つかりません</p>
        <Link href="/services" className="text-blue-600 underline">← サービス一覧へ戻る</Link>
      </div>
    </main>
  );

  const category    = service.category ?? "その他";
  const iconEmoji   = service.iconEmoji ?? categoryFallbackEmoji[category] ?? "📦";
  const tags        = service.tags ?? [];
  const useCases    = service.useCases ?? [];
  const samplePath  = service.samplePath ?? "/";
  const sampleMethod = service.sampleMethod ?? "GET";
  const sampleBody  = (service.sampleBody as Record<string, unknown> | null) ?? null;
  const price       = parseFloat(service.pricePerCallUsdc);
  const monthlyEst  = (price * 1000).toFixed(2);

  const sampleAgent = `import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx", args: ["-y", "pay-per-call-mcp"],
  env: { ...process.env, LEMON_CAKE_PAY_TOKEN: process.env.LEMON_CAKE_PAY_TOKEN! },
});
const mcp = new Client({ name: "my-agent", version: "1.0.0" });
await mcp.connect(transport);

const result = await mcp.callTool({
  name: "call_service",
  arguments: {
    serviceId: "${service.id}",
    method:    "${sampleMethod}",
    path:      "${samplePath}",${sampleBody ? `\n    body:      ${JSON.stringify(sampleBody, null, 2).split("\n").join("\n    ")},` : ""}
  },
});
console.log(result);
`;

  const sampleCurl = `curl -X ${sampleMethod} "https://api.lemoncake.xyz/api/proxy/${service.id}${samplePath}" \\
  -H "Authorization: Bearer $LEMON_CAKE_PAY_TOKEN" \\
  -H "Content-Type: application/json"${sampleBody ? ` \\\n  -d '${JSON.stringify(sampleBody)}'` : ""}`;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header — Glama-inspired hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          <Link href="/services" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">← 全サービス</Link>

          <div className="flex items-start gap-3 sm:gap-4">
            {/* Icon */}
            <div className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-3xl sm:text-4xl select-none">
              {iconEmoji}
            </div>
            {/* Title block */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-1 truncate">{service.providerName}</p>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">{service.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`text-[10px] sm:text-xs font-medium px-2 py-0.5 rounded-full border ${categoryColors[category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                  {category}
                </span>
                <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-100">
                  {service.type}
                </span>
                {tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
            {/* Price block */}
            <div className="text-right flex-shrink-0">
              <div className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">${price.toFixed(4)}</div>
              <div className="text-xs text-gray-400 mt-1">/ 1 call</div>
              <div className="text-[10px] text-gray-400 mt-1">月 1,000 ≒ ${monthlyEst}</div>
            </div>
          </div>

          {/* Short tagline */}
          {service.description && (
            <p className="text-sm sm:text-base text-gray-600 mt-4 sm:mt-6 leading-relaxed">{service.description}</p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-4 sm:space-y-6">
        {/* Long description */}
        {service.longDescription && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">概要</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{service.longDescription}</p>
          </div>
        )}

        {/* Use cases */}
        {useCases.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">こんな時に使える</h2>
            <ul className="space-y-2">
              {useCases.map((uc, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">▸</span>
                  <span>{uc}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Service ID */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Service ID</h2>
          <code className="block bg-gray-50 px-3 py-2 rounded-lg font-mono text-xs text-gray-800 break-all">{service.id}</code>
          <p className="text-xs text-gray-400 mt-2">エージェントが <code className="bg-gray-100 px-1 rounded">call_service</code> に渡す ID</p>
        </div>

        {/* Sample request */}
        {(samplePath || sampleBody) && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">サンプルリクエスト</h2>
            <div className="grid sm:grid-cols-3 gap-2 text-xs mb-4">
              <div className="bg-gray-50 px-3 py-2 rounded">
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">method</div>
                <div className="font-mono font-semibold">{sampleMethod}</div>
              </div>
              <div className="bg-gray-50 px-3 py-2 rounded sm:col-span-2">
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">path</div>
                <div className="font-mono font-semibold break-all">{samplePath}</div>
              </div>
            </div>
            {sampleBody !== null && (
              <>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">request body (JSON)</div>
                <pre className="bg-gray-900 text-emerald-300 rounded-lg p-3 text-xs font-mono overflow-x-auto">{JSON.stringify(sampleBody, null, 2)}</pre>
              </>
            )}
          </div>
        )}

        {/* Curl */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">cURL で叩く</h2>
          <pre className="bg-gray-900 text-emerald-300 rounded-lg p-4 text-xs font-mono overflow-x-auto">{sampleCurl}</pre>
        </div>

        {/* Agent code */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">エージェントから呼ぶ (TypeScript)</h2>
          <pre className="bg-gray-900 text-emerald-300 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">{sampleAgent}</pre>
        </div>

        {/* Provider docs link */}
        {service.documentationUrl && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">公式ドキュメント</h2>
            <a
              href={service.documentationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 underline break-all"
            >
              {service.documentationUrl}
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75}>
                <path d="M11 3h6v6M17 3l-8 8M8 5H5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3"/>
              </svg>
            </a>
            <p className="text-[11px] text-gray-400 mt-2">提供元の API リファレンス・パラメータ詳細</p>
          </div>
        )}

        {/* CTA */}
        <div className="bg-gray-900 rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-white font-semibold mb-1">90 秒で組み込み</p>
            <code className="text-xs font-mono text-gray-400 break-all">npx create-lemon-agent my-agent</code>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-yellow-300 text-gray-900 text-sm font-bold rounded-xl hover:bg-yellow-400 transition-colors whitespace-nowrap">
            Pay Token 発行 →
          </Link>
        </div>
      </div>
    </main>
  );
}
