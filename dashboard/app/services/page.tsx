import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用可能なサービス一覧 — LemonCake",
  description: "LemonCake で AI エージェントが自律課金できるサービス一覧。天気・検索・株価・LLM・画像生成など。USDC で従量課金、freee / Money Forward に自動仕訳。",
};

const SERVICES = [
  {
    id: "weather",
    name: "Weather Forecast API",
    provider: "OpenWeather",
    price: 0.002,
    category: "データ",
    description: "世界200,000都市のリアルタイム気象・予報データ",
    tags: ["天気", "リアルタイム"],
  },
  {
    id: "search",
    name: "Web Search (Serper)",
    provider: "Serper",
    price: 0.005,
    category: "検索",
    description: "Google 検索結果をリアルタイムで取得。ニュース・画像・マップ対応",
    tags: ["検索", "ニュース"],
  },
  {
    id: "stocks",
    name: "Tokyo Stock Exchange Data",
    provider: "JPX Data Cloud",
    price: 0.01,
    category: "金融",
    description: "東証リアルタイム株価・指数・OHLCV・板情報",
    tags: ["株価", "東証", "金融"],
  },
  {
    id: "claude",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
    price: 0.00025,
    category: "AI推論",
    description: "高速・低コストなClaudeモデル。エージェント間タスクに最適",
    tags: ["LLM", "Claude"],
  },
  {
    id: "gpt",
    name: "GPT-4o Inference",
    provider: "OpenAI",
    price: 0.005,
    category: "AI推論",
    description: "GPT-4o チャット・補完エンドポイント。マルチモーダル対応",
    tags: ["LLM", "GPT"],
  },
  {
    id: "image",
    name: "Image Generation API",
    provider: "Stability AI",
    price: 0.004,
    category: "画像生成",
    description: "Stable Diffusion XL。テキスト→画像・img2img 対応",
    tags: ["画像", "生成AI"],
  },
  {
    id: "github-mcp",
    name: "GitHub MCP Server",
    provider: "GitHub OSS",
    price: 0.0003,
    category: "MCP",
    description: "GitHub リポジトリ読み取り・Issue 操作・PR レビューを MCP で",
    tags: ["GitHub", "MCP", "DevTools"],
  },
  {
    id: "fs-mcp",
    name: "Filesystem MCP Server",
    provider: "Anthropic OSS",
    price: 0.0005,
    category: "MCP",
    description: "ローカル・クラウドファイルシステムへの読み書き・検索を MCP で",
    tags: ["ファイル", "MCP"],
  },
  {
    id: "pg-mcp",
    name: "PostgreSQL MCP",
    provider: "Supabase OSS",
    price: 0.0008,
    category: "MCP",
    description: "PostgreSQL クエリ・スキーマ操作を MCP で提供",
    tags: ["DB", "SQL", "MCP"],
  },
  {
    id: "jpyc",
    name: "JPYC Payment Gateway",
    provider: "JPYC Inc.",
    price: 0.0015,
    category: "決済",
    description: "JPYC ステーブルコイン（Polygon）による決済受付・送金 API",
    tags: ["JPYC", "決済", "円建て"],
  },
];

const CATEGORY_ORDER = ["データ", "検索", "金融", "AI推論", "画像生成", "MCP", "決済"];

const categoryColors: Record<string, string> = {
  "データ":   "bg-blue-50 text-blue-700",
  "検索":     "bg-purple-50 text-purple-700",
  "金融":     "bg-green-50 text-green-700",
  "AI推論":   "bg-orange-50 text-orange-700",
  "画像生成": "bg-pink-50 text-pink-700",
  "MCP":      "bg-yellow-50 text-yellow-700",
  "決済":     "bg-teal-50 text-teal-700",
};

export default function ServicesPage() {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    services: SERVICES.filter((s) => s.category === cat),
  })).filter((g) => g.services.length > 0);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-6 inline-block">← LemonCake</Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">利用可能なサービス</h1>
          <p className="text-gray-500 max-w-2xl">
            AI エージェントが <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">ALL</code> スコープの Pay Token で自律課金できるサービス一覧です。
            1 回の呼び出しごとに USDC で課金され、freee / Money Forward に自動仕訳されます。
          </p>
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

      {/* Service grid */}
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {grouped.map(({ cat, services }) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {services.map((svc) => (
                <div key={svc.id} className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-gray-300 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{svc.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{svc.provider}</p>
                    </div>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${categoryColors[svc.category] ?? "bg-gray-100 text-gray-600"}`}>
                      {svc.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 leading-relaxed">{svc.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 flex-wrap">
                      {svc.tags.map((t) => (
                        <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                    <span className="text-sm font-mono font-semibold text-gray-900">
                      ${svc.price.toFixed(4)}<span className="text-gray-400 font-normal text-xs">/call</span>
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
