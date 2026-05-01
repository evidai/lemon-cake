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
}

interface UsageHint { path: string; method: string; body?: unknown; description: string }

function usageHintFor(name: string): UsageHint | undefined {
  const n = name.toLowerCase();
  if (n.includes("serper"))     return { path: "/search",       method: "POST", body: { q: "東京の天気", num: 3 },                description: "Google検索 (organic, news, images, knowledge graph)" };
  if (n.includes("hunter"))     return { path: "/domain-search?domain=anthropic.com&limit=5", method: "GET",                       description: "ドメインから企業の連絡先メール一覧 (役職・信頼度付き)" };
  if (n.includes("jina"))       return { path: "/?url=https://example.com", method: "GET",                                          description: "Webページを LLM-ready Markdown に変換" };
  if (n.includes("firecrawl"))  return { path: "/scrape",       method: "POST", body: { url: "https://example.com" },              description: "JS実行ありのWebスクレイピング → Markdown" };
  if (n.includes("ipinfo"))     return { path: "/8.8.8.8",      method: "GET",                                                      description: "IP geolocation・ISP・ASN・risk score" };
  if (n.includes("exchange") || n.includes("為替")) return { path: "/latest.json", method: "GET",                                   description: "USD基準の170+通貨レート" };
  if (n.includes("slack"))      return { path: "/chat.postMessage", method: "POST", body: { channel: "C123ABC", text: "hi" },      description: "Slackメッセージ送信、人間の判断仰ぎに最適" };
  if (n.includes("gbiz"))       return { path: "/hojin/3010001088782", method: "GET",                                               description: "経産省 gBizINFO 法人情報 (法人番号13桁)" };
  if (n.includes("インボイス") || n.includes("invoice")) return { path: "/check?id=T1234567890123", method: "GET",                  description: "国税庁 適格請求書発行事業者番号の照合" };
  if (n.includes("e-gov") || n.includes("法令")) return { path: "/keyword?keyword=憲法", method: "GET",                              description: "日本の法律・政令を全文検索" };
  if (n.includes("vat") || n.includes("abstract")) return { path: "/validate?vat_number=DE259597697", method: "GET",                description: "EU VAT番号有効性検証" };
  if (n.includes("coze") || n.includes("test")) return { path: "/anything", method: "POST", body: { test: "value" },                 description: "Echoサーバ (リクエストをそのまま200で返す、デバッグ用)" };
  return undefined;
}

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

  const hint = usageHintFor(service.name);
  const price = parseFloat(service.pricePerCallUsdc);
  const monthlyEst = (price * 1000).toFixed(2);

  const sampleAgent = `import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "npx", args: ["-y", "lemon-cake-mcp"],
  env: { ...process.env, LEMON_CAKE_PAY_TOKEN: process.env.LEMON_CAKE_PAY_TOKEN! },
});
const mcp = new Client({ name: "my-agent", version: "1.0.0" });
await mcp.connect(transport);

const result = await mcp.callTool({
  name: "call_service",
  arguments: {
    serviceId: "${service.id}",
    method:    "${hint?.method ?? "GET"}",
    path:      "${hint?.path ?? "/"}",${hint?.body ? `\n    body:      ${JSON.stringify(hint.body, null, 2).split("\n").join("\n    ")},` : ""}
  },
});
console.log(result);
`;

  const sampleCurl = `curl -X ${hint?.method ?? "GET"} "https://api.lemoncake.xyz/api/proxy/${service.id}${hint?.path ?? "/"}" \\
  -H "Authorization: Bearer $LEMON_CAKE_PAY_TOKEN" \\
  -H "Content-Type: application/json"${hint?.body ? ` \\\n  -d '${JSON.stringify(hint.body)}'` : ""}`;

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Link href="/services" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">← 全サービス</Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">{service.providerName}</p>
              <h1 className="text-2xl font-bold text-gray-900">{service.name}</h1>
              {hint?.description && <p className="text-sm text-gray-500 mt-2 max-w-xl">{hint.description}</p>}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-gray-900 tabular-nums">${price.toFixed(4)}</div>
              <div className="text-xs text-gray-400 mt-1">/ 1 call</div>
              <div className="text-[10px] text-gray-400 mt-1">月 1,000 コール ≒ ${monthlyEst}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
        {/* Service ID */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Service ID</h2>
          <code className="block bg-gray-50 px-3 py-2 rounded-lg font-mono text-xs text-gray-800 break-all">{service.id}</code>
          <p className="text-xs text-gray-400 mt-2">エージェントが <code className="bg-gray-100 px-1 rounded">call_service</code> に渡す ID</p>
        </div>

        {/* Sample request */}
        {hint && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">サンプルリクエスト</h2>
            <div className="grid sm:grid-cols-3 gap-2 text-xs mb-4">
              <div className="bg-gray-50 px-3 py-2 rounded">
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">method</div>
                <div className="font-mono font-semibold">{hint.method}</div>
              </div>
              <div className="bg-gray-50 px-3 py-2 rounded sm:col-span-2">
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-0.5">path</div>
                <div className="font-mono font-semibold break-all">{hint.path}</div>
              </div>
            </div>
            {hint.body !== undefined && (
              <>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">request body (JSON)</div>
                <pre className="bg-gray-900 text-emerald-300 rounded-lg p-3 text-xs font-mono overflow-x-auto">{JSON.stringify(hint.body, null, 2)}</pre>
              </>
            )}
          </div>
        )}

        {/* Curl */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">cURL で叩く</h2>
          <pre className="bg-gray-900 text-emerald-300 rounded-lg p-4 text-xs font-mono overflow-x-auto">{sampleCurl}</pre>
        </div>

        {/* Agent code */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">エージェントから呼ぶ (TypeScript)</h2>
          <pre className="bg-gray-900 text-emerald-300 rounded-lg p-4 text-xs font-mono overflow-x-auto leading-relaxed">{sampleAgent}</pre>
        </div>

        {/* CTA */}
        <div className="bg-gray-900 rounded-2xl p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold mb-1">90 秒で組み込み</p>
            <code className="text-xs font-mono text-gray-400">npx create-lemon-agent my-agent</code>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-yellow-300 text-gray-900 text-sm font-bold rounded-xl hover:bg-yellow-400 transition-colors whitespace-nowrap">
            Pay Token 発行 →
          </Link>
        </div>
      </div>
    </main>
  );
}
