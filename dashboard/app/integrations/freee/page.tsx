import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "LemonCake × freee 連携 — AI エージェントの決済を自動仕訳（源泉・インボイス対応）",
  description:
    "LemonCake の決済データを freee に自動仕訳するインテグレーション。AI エージェントが外部 API 決済を行うたび、外注費 / 通信費 と 普通預金 の仕訳、源泉徴収 10.21% 按分、適格請求書発行事業者（インボイス）国税庁 API チェック、USDC/JPYC → 円換算、電子帳簿保存法 7 年保持まで全自動化します。",
  alternates: { canonical: "https://lemoncake.aievid.com/integrations/freee" },
  openGraph: {
    title: "LemonCake × freee 連携 — AI エージェントの決済を自動仕訳",
    description:
      "Pay Token 決済のたびに freee へ自動記帳。源泉徴収按分・インボイス判定・USDC/JPYC 円換算・電帳法対応まで一気通貫。",
    url: "https://lemoncake.aievid.com/integrations/freee",
    type: "article",
  },
};

// ── FAQPage JSON-LD（AI 検索エンジンが FAQ 構造を認識して引用しやすくする） ──
const freeeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Money Forward と freee の併用はできますか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい。環境変数 ACCOUNTING_PROVIDER=both で両方に同時書き込み可能です。片方だけ使う構成も選べます。",
      },
    },
    {
      "@type": "Question",
      name: "連携を解除するとどうなりますか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "freee 側で OAuth 連携を解除すると、LemonCake からの新規仕訳作成は即座に停止します。既に作成された仕訳は freee に残ります。LemonCake 側で保管していたアクセストークンは即日 DB から削除されます。",
      },
    },
    {
      "@type": "Question",
      name: "審査対象の freee アプリですか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい。LemonCake は freee アプリストアの公開アプリとして審査申請中です。審査通過後、freee 上の任意の事業所から 1 クリックで連携可能になります。",
      },
    },
    {
      "@type": "Question",
      name: "個人事業主の freee アカウントでも使えますか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "はい。freee の全プラン（個人事業主・ミニマム・ベーシック・プロフェッショナル・エンタープライズ）で動作します。",
      },
    },
    {
      "@type": "Question",
      name: "源泉徴収の自動按分はどう処理されますか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "受領者が個人で報酬区分が源泉対象の場合、10.21%（100 万円超部分は 20.42%）を自動計算し、外注費 / 預り金 / 普通預金 の 3 勘定に按分して freee に記帳します。",
      },
    },
    {
      "@type": "Question",
      name: "インボイス（適格請求書）の判定はどのように行われますか？",
      acceptedAnswer: {
        "@type": "Answer",
        text: "国税庁の適格請求書発行事業者公表システム API（invoice-kohyo.nta.go.jp）をリアルタイムで叩き、登録番号を照合します。登録済みなら tax_name を「課税仕入 10%」、未登録なら「課税仕入不可（非適格）」で自動記帳します。",
      },
    },
  ],
};

// ── HowTo JSON-LD（連携 3 ステップ） ──
const freeeHowToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "LemonCake を freee に連携する方法",
  description: "AI エージェントの決済を freee に自動仕訳するための 3 ステップ連携手順。",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "freee アプリストアで LemonCake をインストール",
      text: "freee にログインした状態で、freee アプリストア上の LemonCake ページから「連携する」をクリック。OAuth 画面で権限を承認します。",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "LemonCake ダッシュボードで事業所を選択",
      text: "LemonCake に戻ると「連携成功」と表示され、複数事業所がある場合は仕訳を書き込む先の事業所を 1 つ選択します。",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Pay Token を発行して決済を開始",
      text: "ダッシュボードから Pay Token を発行し、Dify / Coze / MCP / 独自エージェント に渡します。以降の決済は全て自動で freee に仕訳が作成されます。",
    },
  ],
};

export default function FreeeIntegrationPage() {
  return (
    <main className="min-h-screen bg-[#fffd43] text-[#1a0f00]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(freeeFaqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(freeeHowToJsonLd) }}
      />
      <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
        <nav className="mb-10 text-sm font-medium">
          <Link href="/" className="hover:underline">← Home</Link>
          <span className="mx-2 opacity-40">/</span>
          <Link href="/about" className="hover:underline">About</Link>
          <span className="mx-2 opacity-40">/</span>
          <span className="opacity-60">Integrations — freee</span>
        </nav>

        <div className="flex items-center gap-4 mb-6">
          <div className="text-5xl md:text-6xl font-black tracking-tight">LemonCake</div>
          <div className="text-3xl opacity-40">×</div>
          <Image
            src="/freee-logo.png"
            alt="freee"
            width={120}
            height={40}
            className="h-10 w-auto"
          />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
          AIエージェントの決済を、freee に自動仕訳。
        </h1>
        <p className="text-lg leading-relaxed mb-12 opacity-80">
          LemonCake が発行する Pay Token で AIエージェントが外部API決済を行うたび、
          <strong>「外注費 / 通信費 ↔ 普通預金」の仕訳を自動生成</strong>
          して freee に記帳します。源泉徴収按分、適格請求書発行事業者チェック（国税庁API連携）、
          USDC → 円 換算まで一気通貫。経理担当者の月次工数をゼロに近づけます。
        </p>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <FeatureCard
            title="決済ごとに自動仕訳"
            body="Pay Token 決済が確定した瞬間に freee の取引API (POST /api/1/deals) を叩いて仕訳を作成。手作業のCSVインポート不要。"
          />
          <FeatureCard
            title="源泉徴収 自動按分"
            body="源泉徴収対象の取引は「外注費 / 預り金 / 普通預金」の3勘定に自動で按分。10.21%・20.42%の判定も自動。"
          />
          <FeatureCard
            title="適格請求書チェック"
            body="国税庁APIで取引先のインボイス登録番号を照合し、仕訳のtax_nameを「課税仕入10%」or「課税仕入不可（非適格）」に自動切替。"
          />
          <FeatureCard
            title="USDC → 円 換算"
            body="決済時刻の為替レートで JPY 換算し、仕訳金額・摘要・Evidence Hash を付与。暗号資産会計の要件をクリア。"
          />
        </div>

        {/* How to Connect */}
        <h2 className="text-2xl md:text-3xl font-bold mb-6">連携手順（3ステップ）</h2>
        <ol className="space-y-6 mb-16">
          <Step
            num={1}
            title="freee アプリストアで LemonCake をインストール"
            body="freee にログインした状態で、freee アプリストア上の LemonCake ページから「連携する」をクリック。OAuth画面で権限を承認します。"
          />
          <Step
            num={2}
            title="LemonCake ダッシュボードで事業所を選択"
            body="LemonCake に戻ると「連携成功」と表示され、複数事業所がある場合は仕訳を書き込む先の事業所を1つ選択します。"
          />
          <Step
            num={3}
            title="Pay Token を発行して決済を開始"
            body="ダッシュボードから Pay Token を発行し、Dify / Coze / MCP / 独自エージェント に渡します。以降の決済は全て自動で freee に仕訳が作成されます。"
          />
        </ol>

        {/* Required Scopes */}
        <h2 className="text-2xl md:text-3xl font-bold mb-4">要求する freee 権限</h2>
        <p className="mb-4 opacity-80">
          最小権限の原則に基づき、以下のみ要求します。人事労務・工数管理・請求書系のデータには一切アクセスしません。
        </p>
        <div className="bg-black/5 rounded-lg p-6 mb-16 text-sm font-mono">
          <Perm label="[会計] 事業所" value="参照のみ" />
          <Perm label="[会計] 勘定科目" value="参照のみ" />
          <Perm label="[会計] 税区分" value="参照のみ" />
          <Perm label="[会計] 取引" value="参照 + 更新" note="← メイン機能" />
          <Perm label="[会計] 取引先" value="参照 + 更新" />
        </div>

        {/* Security */}
        <h2 className="text-2xl md:text-3xl font-bold mb-4">セキュリティ</h2>
        <ul className="list-disc pl-6 space-y-2 mb-16 opacity-90">
          <li>通信は TLS 1.3 強制。plaintext 接続は拒否。</li>
          <li>OAuth アクセストークン / リフレッシュトークンは AES-256 で暗号化保管（Vercel Secrets）。</li>
          <li>401エラー時は自動でリフレッシュ → 1回だけリトライ。トークン更新は DB に同期書き込み。</li>
          <li>監査ログは90日保持。インシデント発生時は4時間以内にユーザー通知。</li>
          <li>連携解除時は OAuth トークンを即時DB削除。仕訳データは freee 側に残り、LemonCake 側には複製しません。</li>
          <li>SOC2 Type I: 2026年Q3取得予定。</li>
        </ul>

        {/* FAQ */}
        <h2 className="text-2xl md:text-3xl font-bold mb-4">よくある質問</h2>
        <div className="space-y-6 mb-16">
          <Faq
            q="Money Forward と freee の併用はできますか？"
            a="はい。環境変数 ACCOUNTING_PROVIDER=both で両方に同時書き込み可能です。片方だけ使う構成も選べます。"
          />
          <Faq
            q="連携を解除するとどうなりますか？"
            a="freee 側で OAuth 連携を解除すると、LemonCake からの新規仕訳作成は即座に停止します。既に作成された仕訳は freee に残ります。LemonCake 側で保管していたアクセストークンは即日DBから削除されます。"
          />
          <Faq
            q="審査対象の freee アプリですか？"
            a="はい。LemonCake は freee アプリストアの公開アプリとして審査申請中です。審査通過後、freee 上の任意の事業所から1クリックで連携可能になります。"
          />
          <Faq
            q="個人開発の freee アカウントでも使えますか？"
            a="はい。freee の全プラン（個人事業主・ミニマム・ベーシック・プロフェッショナル・エンタープライズ）で動作します。"
          />
        </div>

        {/* CTA */}
        <div className="bg-black text-[#fffd43] rounded-xl p-8 mb-16">
          <h2 className="text-2xl md:text-3xl font-black mb-3">
            AIエージェントに財布を持たせよう。
          </h2>
          <p className="mb-6 opacity-80">
            LemonCake のアカウント作成は30秒。freee 連携は3クリック。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-block bg-[#fffd43] text-black px-6 py-3 rounded-lg font-bold hover:opacity-90"
            >
              無料で始める →
            </Link>
            <Link
              href="/about"
              className="inline-block border border-[#fffd43] px-6 py-3 rounded-lg font-bold hover:bg-[#fffd43] hover:text-black"
            >
              LemonCake とは？
            </Link>
          </div>
        </div>

        <div className="text-sm opacity-60">
          運営: evidai ・ お問い合わせ: <a className="underline" href="mailto:contact@aievid.com">contact@aievid.com</a>
          <br />
          <Link href="/legal/terms" className="underline">利用規約</Link>
          {" / "}
          <Link href="/legal/dify-plugin" className="underline">プライバシーポリシー</Link>
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-black/5 rounded-lg p-6">
      <h3 className="font-bold mb-2">{title}</h3>
      <p className="text-sm opacity-80 leading-relaxed">{body}</p>
    </div>
  );
}

function Step({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-black text-[#fffd43] flex items-center justify-center font-black">
        {num}
      </div>
      <div>
        <h3 className="font-bold text-lg mb-1">{title}</h3>
        <p className="opacity-80 leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

function Perm({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between py-1">
      <span>{label}</span>
      <span className="opacity-80">
        {value}
        {note && <span className="ml-2 text-xs opacity-60">{note}</span>}
      </span>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <h3 className="font-bold mb-2">Q. {q}</h3>
      <p className="opacity-80 leading-relaxed">A. {a}</p>
    </div>
  );
}
