import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const SITE_URL  = "https://lemoncake.aievid.com";
const SITE_NAME = "LemonCake";
const DESC_JA   = "LemonCake は AI エージェント専用の M2M 決済・会計インフラ。Pay Token 1 行で外部 API に自律決済、freee / MoneyForward に自動仕訳、源泉徴収 10.21% / インボイス（国税庁 API）/ 電子帳簿保存法 7 年保持まで全自動。JPYC・USDC 対応、Polygon 実質 1 円/件。Dify・LangChain・MCP 対応。";
const DESC_EN   = "LemonCake is the M2M payment + accounting infrastructure built for AI agents. One-line Pay Tokens let agents pay external APIs autonomously, with auto-journaling to freee / MoneyForward, Japanese withholding tax (10.21%), invoice registration (NTA API), and 7-year ledger retention fully automated. JPYC & USDC on Polygon, ~1 JPY/tx. Dify / LangChain / MCP ready.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LemonCake — AI エージェント向け M2M 決済・会計インフラ",
    template: "%s | LemonCake",
  },
  description: DESC_JA,
  applicationName: SITE_NAME,
  authors: [{ name: "evidai", url: "https://aievid.com" }],
  creator: "evidai",
  publisher: "evidai",
  keywords: [
    "AIエージェント",
    "AIエージェント 決済",
    "AIエージェント 財布",
    "M2M決済",
    "Machine to Machine Payment",
    "Pay Token",
    "JPYC",
    "USDC",
    "Polygon",
    "freee 連携",
    "MoneyForward 連携",
    "源泉徴収 自動",
    "インボイス 国税庁 API",
    "電子帳簿保存法",
    "Dify 決済",
    "LangChain 決済",
    "MCP サーバー",
    "AI wallet Japan",
    "Agent payments",
    "Skyfire 代替",
    "x402 日本",
    "LemonCake",
    "レモンケーキ",
    "evidai",
    "aievid",
  ],
  alternates: {
    canonical: SITE_URL,
    languages: {
      "ja-JP": `${SITE_URL}/about`,
      "en-US": `${SITE_URL}/about/en`,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "LemonCake — AI エージェントに財布を持たせる。日本の税務・会計まで全自動。",
    description: DESC_JA,
    locale: "ja_JP",
    alternateLocale: ["en_US"],
    images: [
      {
        url: `${SITE_URL}/logo.png`,
        width: 1200,
        height: 630,
        alt: "LemonCake — AI Agent M2M Payment Infrastructure",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@aievid",
    creator: "@aievid",
    title: "LemonCake — AI エージェント向け M2M 決済・会計インフラ",
    description: DESC_JA,
    images: [`${SITE_URL}/logo.png`],
  },
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  category: "technology",
  other: {
    "ai-generated-content": "false",
    "description:en": DESC_EN,
  },
};

// ── JSON-LD: Organization + WebSite + SoftwareApplication ──────────────────
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: "LemonCake",
      alternateName: ["レモンケーキ", "LemonCake by evidai"],
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      email: "contact@aievid.com",
      founder: { "@type": "Organization", name: "evidai", url: "https://aievid.com" },
      description: DESC_JA,
      sameAs: ["https://aievid.com"],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "contact@aievid.com",
        availableLanguage: ["Japanese", "English"],
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: "ja-JP",
      publisher: { "@id": `${SITE_URL}#organization` },
      description: DESC_JA,
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}#app`,
      name: "LemonCake",
      applicationCategory: "FinanceApplication",
      applicationSubCategory: "AI Agent Payment Infrastructure",
      operatingSystem: "Web, API, MCP",
      url: SITE_URL,
      description: DESC_JA,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "JPY",
        description: "Free tier available. Usage-based pricing after.",
      },
      featureList: [
        "AI エージェント向け Pay Token 発行",
        "JPYC / USDC による M2M 決済（Polygon）",
        "freee / MoneyForward 自動仕訳",
        "源泉徴収 10.21% 自動判定",
        "適格請求書発行事業者（インボイス）国税庁 API 連携",
        "電子帳簿保存法 7 年自動保持",
        "Dify / LangChain / MCP サーバー対応",
        "KYA / KYC ティアモデル（Agent-of-Record 契約）",
        "Reputation スコアによる予算・信用管理",
      ],
      publisher: { "@id": `${SITE_URL}#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="canonical" href={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
