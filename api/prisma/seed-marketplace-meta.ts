/**
 * Marketplace meta backfill — fills description / category / tags / useCases /
 * sample request shape / iconEmoji for the 15 services that already exist
 * in production (LemonCake Platform-listed). Idempotent: safe to re-run.
 *
 * Run: cd api && npx tsx prisma/seed-marketplace-meta.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Meta = {
  description?: string;
  longDescription?: string;
  category?: string;
  tags?: string[];
  iconEmoji?: string;
  useCases?: string[];
  samplePath?: string;
  sampleMethod?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  sampleBody?: unknown;
  documentationUrl?: string;
};

// Match by service ID (preferred) OR by name pattern (fallback for resilience).
const ENTRIES: Array<{ id?: string; namePattern?: RegExp; meta: Meta }> = [
  {
    id: "test-service",
    meta: {
      iconEmoji: "🧪",
      category: "テスト",
      description: "リクエストをそのまま 200 で返す echo エンドポイント。エージェントの組み込み確認・課金フロー検証用。",
      longDescription: "httpbin.org の /anything を経由する単純な echo サーバ。LemonCake の Pay Token 統合をテストする時に最初に叩くべきサービス。method・headers・body をそのまま返してくるので、`call_service` の引数が正しく proxy に到達しているか目で確認できる。1 コール $0.005 と極小料金なので、CI でのスモークテストにも使える。",
      tags: ["echo", "デバッグ", "統合テスト"],
      useCases: [
        "Pay Token 発行直後の動作確認",
        "MCP クライアントの引数マッピングをデバッグ",
        "CI でのスモークテスト（404/401 を踏まずに 200 を確認）",
      ],
      samplePath: "/anything",
      sampleMethod: "POST",
      sampleBody: { hello: "world", agent: "test" },
      documentationUrl: "https://httpbin.org/",
    },
  },
  {
    namePattern: /Serper.*Google Search|Serper/i,
    meta: {
      iconEmoji: "🔍",
      category: "検索",
      description: "Google 検索結果を構造化 JSON で取得。organic / news / images / knowledge graph に対応。",
      longDescription: "Serper.dev を経由した Google 検索プロキシ。エージェントが「最新の◯◯について調べて」と言われた時に最初に叩くべきツール。`q` で検索クエリ、`num` で件数を指定するだけで organic results / news / knowledge graph を構造化 JSON で返す。レイテンシ < 1 秒、レート制限はプラットフォーム側で吸収済み。",
      tags: ["Web検索", "Google", "リアルタイム", "ニュース"],
      useCases: [
        "最新ニュース・トレンドのリサーチ",
        "競合企業情報の収集",
        "事実確認 (fact checking)",
        "ロングテール SEO ワード調査",
      ],
      samplePath: "/search",
      sampleMethod: "POST",
      sampleBody: { q: "AI agent 決済 2026", num: 5 },
      documentationUrl: "https://serper.dev/",
    },
  },
  {
    namePattern: /Firecrawl.*Web Scraping|Firecrawl(?!.*MCP)/i,
    meta: {
      iconEmoji: "🕸️",
      category: "Web取得",
      description: "JS 実行ありの Web スクレイピング。任意の URL を LLM-ready な Markdown / clean text に変換。",
      longDescription: "Firecrawl の /scrape エンドポイントを経由。SPA / 動的レンダリングのページも JS 実行込みで取得し、ノイズ除去された Markdown を返す。エージェントが「この URL の内容を要約して」と頼まれたら呼ぶ。robots.txt と rate limit はサービス側が遵守。",
      tags: ["スクレイピング", "Markdown", "JavaScript対応", "LLM-ready"],
      useCases: [
        "競合プロダクトのランディングページ解析",
        "ニュース記事の本文抽出（広告・ナビ排除済み）",
        "Wikipedia 等のリファレンスを Markdown 化",
        "RAG 用のドキュメントインデックス構築",
      ],
      samplePath: "/scrape",
      sampleMethod: "POST",
      sampleBody: { url: "https://lemoncake.xyz" },
      documentationUrl: "https://docs.firecrawl.dev/",
    },
  },
  {
    namePattern: /Firecrawl MCP/i,
    meta: {
      iconEmoji: "🤖",
      category: "Web取得",
      description: "Firecrawl の機能を MCP プロトコルで提供。Claude Desktop / Cursor から直接スクレイピング。",
      longDescription: "Firecrawl の web スクレイピング・クロール機能を Model Context Protocol で公開する MCP サーバ。`call_service` 経由で MCP クライアントから Firecrawl のツールセット (scrape / crawl / map / search) をすべて呼び出せる。同じ機能を生 HTTP よりも構造化された MCP セマンティクス（tools/list で発見可能）で利用したいエージェントに最適。",
      tags: ["MCP", "スクレイピング", "Claude Desktop", "Cursor"],
      useCases: [
        "MCP ネイティブな agent から Firecrawl を呼ぶ",
        "ツール発見性 (tools/list) で agent が動的に scrape/crawl を選択",
        "MCP の sandbox 機能と組み合わせて安全に Web 取得",
      ],
      documentationUrl: "https://docs.firecrawl.dev/mcp",
    },
  },
  {
    namePattern: /国税庁.*インボイス|invoice/i,
    meta: {
      iconEmoji: "🇯🇵",
      category: "日本特化",
      description: "国税庁 API で適格請求書発行事業者番号 (T+13桁) を照合。法人名・登録日・有効性を返す。",
      longDescription: "国税庁が提供する「適格請求書発行事業者公表サイト Web-API」のラッパー。エージェントが請求書を受け取ったときにインボイス番号の有効性を検証し、登録名・所在地と突合できる。返答は構造化 JSON。インボイス制度（2023〜）以降の B2B 自動化エージェントに必須。",
      tags: ["税務", "適格請求書", "国税庁", "インボイス制度"],
      useCases: [
        "受領請求書のインボイス番号自動照合",
        "登録名と取引先 DB の名寄せ確認",
        "免税事業者の検出と仕入税額控除の判定",
        "freee / MoneyForward への自動仕訳の前段チェック",
      ],
      samplePath: "/check?id=T1234567890123",
      sampleMethod: "GET",
      documentationUrl: "https://www.invoice-kohyo.nta.go.jp/",
    },
  },
  {
    namePattern: /gBizINFO|法人情報/i,
    meta: {
      iconEmoji: "🏢",
      category: "日本特化",
      description: "経済産業省 gBizINFO の法人データ照会。法人番号 (13桁) から会社名・住所・代表者・財務を取得。",
      longDescription: "経産省 gBizINFO の REST API ラッパー。日本の全法人 (約 400 万社) のマスターデータにアクセス可能。法人番号から会社名・本店所在地・設立日・代表者・資本金・許認可情報まで取得できる。営業リスト精査・KYC・与信判断・補助金申請の自動化に。",
      tags: ["法人情報", "政府データ", "B2B", "デューデリジェンス"],
      useCases: [
        "営業 lead の名寄せと法人実在確認",
        "取引先の与信判断（資本金・設立日・許認可）",
        "補助金・助成金申請の事前データ充実",
        "営業リストから倒産・休業企業を除外",
      ],
      samplePath: "/hojin/3010001088782",
      sampleMethod: "GET",
      documentationUrl: "https://info.gbiz.go.jp/api/",
    },
  },
  {
    namePattern: /e-Gov|法令/i,
    meta: {
      iconEmoji: "⚖️",
      category: "日本特化",
      description: "e-Gov 法令データから日本の法律・政令・省令を全文検索。条文 XML を取得可能。",
      longDescription: "総務省 e-Gov 法令検索 API のラッパー。日本の現行法令 (約 8,000 件) をキーワード全文検索し、該当する条文を XML / 構造化 JSON で返す。法務エージェントや契約レビューエージェントが「個人情報保護法 第◯条」を引いてくるのに使う。",
      tags: ["法令", "政府", "コンプライアンス", "リーガル"],
      useCases: [
        "契約レビューで参照法令を自動引用",
        "コンプライアンス Q&A エージェント（社内法務）",
        "規制変更のキーワードアラート",
        "顧問弁護士に渡す前の一次法令調査",
      ],
      samplePath: "/keyword?keyword=個人情報",
      sampleMethod: "GET",
      documentationUrl: "https://laws.e-gov.go.jp/apitop/",
    },
  },
  {
    namePattern: /VAT|Abstract/i,
    meta: {
      iconEmoji: "🇪🇺",
      category: "金融",
      description: "EU VAT 番号 (VIES) の有効性を検証。会社名・所在地もあわせて返す。",
      longDescription: "Abstract API の VIES VAT validation。EU 27 カ国 + UK の VAT 番号を VIES (EU 公式システム) に問い合わせ、有効性・登録会社名・所在地を返す。EU 取引のあるサブスクリプション SaaS / EC に必須。日本企業でも EU 顧客の B2B 売上は VAT 検証で 0% リバースチャージ可。",
      tags: ["VAT", "EU", "国際税務", "VIES"],
      useCases: [
        "EU 顧客の B2B VAT 番号自動検証（リバースチャージ判定）",
        "EU 取引先のリスト名寄せ",
        "Stripe / Paddle 連携の VAT 番号バリデーション",
      ],
      samplePath: "/validate?vat_number=DE259597697",
      sampleMethod: "GET",
      documentationUrl: "https://www.abstractapi.com/api/vat-validation-api",
    },
  },
  {
    namePattern: /IPinfo/i,
    meta: {
      iconEmoji: "🌐",
      category: "データ",
      description: "IP アドレスの地理情報・ISP・ASN・risk score。fraud detection と地域別パーソナライズに。",
      longDescription: "IPinfo.io のラッパー。IPv4/v6 から国・都市・郵便番号・タイムゾーン・ISP・ASN・proxy/VPN/Tor 判定・risk score を返す。エージェントが「このアクセスは怪しい？」と判断したいときの一次情報源。",
      tags: ["IP", "geolocation", "fraud", "ASN"],
      useCases: [
        "不審なログインのジオロケーション照合",
        "VPN / Tor / proxy 経由のアクセスをブロック判定",
        "国別フォールバック (JP は freee へ、US は QuickBooks へ)",
        "コンプライアンス: GDPR / 経済制裁国判定",
      ],
      samplePath: "/8.8.8.8",
      sampleMethod: "GET",
      documentationUrl: "https://ipinfo.io/developers",
    },
  },
  {
    namePattern: /Open Exchange Rates|為替/i,
    meta: {
      iconEmoji: "💱",
      category: "金融",
      description: "USD 基準の 170+ 通貨リアルタイム為替レート。1 日 1 回更新、JPY / EUR / CNY / KRW 等。",
      longDescription: "openexchangerates.org のラッパー。USD を base にした 170+ 通貨のレートを取得。日次更新で会計仕訳・収益レポートの USD→JPY 換算に十分な精度。LemonCake 自身も内部で USDC↔JPY 換算に同等の API を使用中。",
      tags: ["為替", "USD/JPY", "FX", "仕訳"],
      useCases: [
        "USDC 売上の JPY 換算（freee / MoneyForward の仕訳前段）",
        "海外子会社の月次連結",
        "請求書発行時の為替予約レート確認",
      ],
      samplePath: "/latest.json",
      sampleMethod: "GET",
      documentationUrl: "https://docs.openexchangerates.org/",
    },
  },
  {
    namePattern: /Hunter\.io|Hunter|連絡先検索/i,
    meta: {
      iconEmoji: "✉️",
      category: "営業/B2B",
      description: "ドメインから企業の連絡先メール一覧を発掘。役職・信頼度スコア付き。",
      longDescription: "Hunter.io の domain-search API のラッパー。ドメインを渡すと、その企業に紐付くメールアドレスを役職・部署・confidence score (0-100) 付きで返す。営業エージェントが「この会社の CTO にコンタクトしたい」と頼まれた時の一次情報源。",
      tags: ["メール発掘", "営業", "B2B", "コンタクト"],
      useCases: [
        "ABM ターゲット企業の意思決定者発掘",
        "投資先候補の経営陣コンタクト探索",
        "営業 lead の役職別優先度付け",
        "リクルーター / 採用エージェントの候補者リサーチ",
      ],
      samplePath: "/domain-search?domain=anthropic.com&limit=5",
      sampleMethod: "GET",
      documentationUrl: "https://hunter.io/api-documentation/v2",
    },
  },
  {
    namePattern: /Slack/i,
    meta: {
      iconEmoji: "💬",
      category: "通知",
      description: "Slack に承認依頼を投稿。Human-in-the-loop の人間判断を待つ用途に最適。",
      longDescription: "Slack Web API の chat.postMessage のラッパー。エージェントが自律実行を続けるべきか迷ったとき、Slack チャンネルにボタン付きメッセージを投稿して人間の承認を待つ HITL パターン用。LemonCake の KYA 上限超え判定とセットで使うと、上限超過時に自動で Slack 通知が走る運用が組める。",
      tags: ["Slack", "HITL", "通知", "承認フロー"],
      useCases: [
        "高額な決済前に人間承認を要求 (HITL)",
        "エージェントが自信ない判断を Slack で人に投げる",
        "KYA 上限超過時のアラート",
        "営業 DM 送信前の最終レビュー",
      ],
      samplePath: "/chat.postMessage",
      sampleMethod: "POST",
      sampleBody: { channel: "C123ABC", text: "Approval needed: send $50 to gpt-4o-mini?" },
      documentationUrl: "https://api.slack.com/methods/chat.postMessage",
    },
  },
  {
    namePattern: /CloudSign/i,
    meta: {
      iconEmoji: "📝",
      category: "ドキュメント",
      description: "CloudSign API で電子契約を作成・送信。NDA や業務委託契約の自動化に。",
      longDescription: "弁護士ドットコムの CloudSign API のラッパー。電子契約書のアップロード・署名者指定・送信・状態取得が可能。営業エージェントが商談を成約に持ち込んだあと自動で NDA / 注文書を送付するフローに使える。日本国内シェア No.1 の電子契約サービス。",
      tags: ["電子契約", "署名", "NDA", "B2B"],
      useCases: [
        "商談成約後の NDA 自動送信",
        "業務委託契約の毎月更新自動化",
        "Pay Token 利用規約の電子同意取得",
        "顧問弁護士の手前段の契約準備",
      ],
      documentationUrl: "https://help.cloudsign.jp/ja/category/api",
    },
  },
  {
    namePattern: /TRUSTDOCK|eKYC/i,
    meta: {
      iconEmoji: "🪪",
      category: "本人確認",
      description: "オンライン本人確認 (eKYC)。マイナンバーカード・運転免許証で犯収法対応の自動 KYC。",
      longDescription: "TRUSTDOCK の eKYC API ラッパー。改正犯収法に準拠したオンライン本人確認 (ホ方式・ホワ方式) を 1 API で実現。LemonCake の KYC tier 昇格 (KYA→KYC) を自動化したい運営者向け。1 件 $0.05 と高めだが、犯収法 + 個情法対応のフルマネージド。",
      tags: ["KYC", "eKYC", "本人確認", "犯収法"],
      useCases: [
        "高額決済バイヤーの自動 KYC 昇格",
        "B2B 取引の代表者 ID 確認",
        "暗号資産取扱業者向け犯収法対応",
        "保険・金融サービスの口座開設",
      ],
      documentationUrl: "https://biz.trustdock.io/",
    },
  },
  {
    namePattern: /Raksul/i,
    meta: {
      iconEmoji: "🖨️",
      category: "ドキュメント",
      description: "ラクスル印刷の発注 API。名刺・チラシ・パンフレットを自動発注。",
      longDescription: "ラクスル法人 API のラッパー。印刷物のテンプレ選択・データ入稿・発注・配送指定を 1 リクエストで完結。営業エージェントが新規 lead に郵送 DM を送りたい時、社内オフライン手続きを介さず直接発注できる。",
      tags: ["印刷", "発注", "DM", "オフライン"],
      useCases: [
        "ABM ターゲット企業への DM 自動送付",
        "イベント時の名刺・パンフレット発注",
        "顧客ごとカスタマイズしたチラシ発送",
      ],
      documentationUrl: "https://corp.raksul.com/services/api/",
    },
  },
];

async function main() {
  const services = await prisma.service.findMany({ orderBy: { createdAt: "desc" } });
  let updated = 0;
  let skipped = 0;

  for (const svc of services) {
    const entry =
      ENTRIES.find((e) => e.id === svc.id) ??
      ENTRIES.find((e) => e.namePattern && e.namePattern.test(svc.name));

    if (!entry) {
      console.log(`[skip] ${svc.id} (${svc.name}) — no matching meta entry`);
      skipped++;
      continue;
    }

    const meta = entry.meta;
    await prisma.service.update({
      where: { id: svc.id },
      data: {
        ...(meta.description      !== undefined ? { description:      meta.description }      : {}),
        ...(meta.longDescription  !== undefined ? { longDescription:  meta.longDescription }  : {}),
        ...(meta.category         !== undefined ? { category:         meta.category }         : {}),
        ...(meta.tags             !== undefined ? { tags:             meta.tags }             : {}),
        ...(meta.iconEmoji        !== undefined ? { iconEmoji:        meta.iconEmoji }        : {}),
        ...(meta.useCases         !== undefined ? { useCases:         meta.useCases }         : {}),
        ...(meta.samplePath       !== undefined ? { samplePath:       meta.samplePath }       : {}),
        ...(meta.sampleMethod     !== undefined ? { sampleMethod:     meta.sampleMethod }     : {}),
        ...(meta.sampleBody       !== undefined ? { sampleBody:       meta.sampleBody as object } : {}),
        ...(meta.documentationUrl !== undefined ? { documentationUrl: meta.documentationUrl } : {}),
      },
    });
    console.log(`[ok]   ${svc.id} (${svc.name}) — ${meta.category} ${meta.iconEmoji}`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, skipped: ${skipped}, total scanned: ${services.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
