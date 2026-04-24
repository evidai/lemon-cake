import Link from "next/link";

export const metadata = {
  title: "LemonCake — 利用規約 / Terms of Service",
  description:
    "LemonCake (運営: evidai) の利用規約。Pay Token 発行、上限付き決済、自動仕訳連携などのサービス利用条件を定めます。",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fffd43] text-[#1a0f00]">
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <nav className="mb-10 text-sm font-medium">
          <Link href="/" className="hover:underline">← Home</Link>
          <span className="mx-2 opacity-40">/</span>
          <Link href="/about" className="hover:underline">About</Link>
          <span className="mx-2 opacity-40">/</span>
          <span className="opacity-60">Legal — 利用規約</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
          LemonCake 利用規約
        </h1>
        <p className="text-sm opacity-60 mb-10">最終更新日: 2026-04-20</p>

        <p className="text-base leading-relaxed mb-8">
          本利用規約（以下「本規約」）は、evidai（以下「当社」）が提供する
          LemonCake（以下「本サービス」）の利用条件を定めるものです。
          本サービスを利用するすべてのお客様（以下「利用者」）は、
          本規約に同意の上、本サービスをご利用ください。
        </p>

        <Section title="第1条（適用）">
          <p>
            本規約は、本サービスの提供条件および当社と利用者との間の権利義務関係を定めることを目的とし、
            利用者と当社との間の本サービスの利用に関わる一切の関係に適用されます。
          </p>
        </Section>

        <Section title="第2条（サービス内容）">
          <p>本サービスは、以下の機能を提供します：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>AIエージェント向け Pay Token（HMAC-SHA256署名、利用上限・有効期限付き）の発行</li>
            <li>USDC ステーブルコインによる外部API決済の仲介</li>
            <li>決済完了後の freee / Money Forward への自動仕訳作成</li>
            <li>国税庁API連携による適格請求書発行事業者チェック</li>
            <li>Pay Token の即時失効（Kill Switch）機能</li>
          </ul>
        </Section>

        <Section title="第3条（利用登録）">
          <p>
            利用登録を希望する者は、本規約に同意の上、当社が定める方法によって利用登録を申請し、
            当社がこれを承認することによって、利用登録が完了するものとします。
          </p>
        </Section>

        <Section title="第4条（利用料金および支払方法）">
          <p>
            利用者は、本サービスの対価として、当社が別途定め本ウェブサイトに表示する利用料金を、
            当社が指定する方法により支払うものとします。
            料金プランおよび手数料は <Link href="/pricing" className="underline">lemoncake.xyz/pricing</Link> に記載します。
          </p>
        </Section>

        <Section title="第5条（禁止事項）">
          <p>利用者は、本サービスの利用にあたり、以下の行為をしてはなりません：</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>法令または公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為（マネーロンダリング、テロ資金供与を含む）</li>
            <li>本サービスのサーバーまたはネットワークの機能を破壊・妨害する行為</li>
            <li>本サービスの運営を妨害するおそれのある行為</li>
            <li>他の利用者に関する個人情報等を収集または蓄積する行為</li>
            <li>不正アクセスをし、またはこれを試みる行為</li>
            <li>他の利用者に成りすます行為</li>
            <li>当社のサービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為</li>
            <li>本サービスを用いて詐欺的決済・不正請求を行う行為</li>
            <li>Pay Token を第三者に無断で譲渡・貸与する行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ul>
        </Section>

        <Section title="第6条（本サービスの提供の停止等）">
          <p>
            当社は、以下のいずれかの事由があると判断した場合、利用者に事前に通知することなく
            本サービスの全部または一部の提供を停止または中断することができるものとします：
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>本サービスにかかるコンピュータシステムの保守点検または更新を行う場合</li>
            <li>地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
            <li>コンピュータまたは通信回線等が事故により停止した場合</li>
            <li>freee / Money Forward / ブロックチェーンネットワーク / 国税庁API 等、当社が依存する外部サービスに障害が発生した場合</li>
            <li>その他、当社が本サービスの提供が困難と判断した場合</li>
          </ul>
        </Section>

        <Section title="第7条（著作権）">
          <p>
            利用者は、自ら著作権等の必要な知的財産権を有するか、または必要な権利者の許諾を得た情報のみ、
            本サービスを利用し、投稿または編集することができるものとします。
          </p>
        </Section>

        <Section title="第8条（利用制限および登録抹消）">
          <p>
            当社は、利用者が以下のいずれかに該当する場合には、事前の通知なく、投稿データを削除し、
            利用者に対して本サービスの全部もしくは一部の利用を制限し、または利用者としての登録を抹消することができるものとします：
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>本規約のいずれかの条項に違反した場合</li>
            <li>登録事項に虚偽の事実があることが判明した場合</li>
            <li>料金等の支払債務の不履行があった場合</li>
            <li>当社からの連絡に対し、一定期間返答がない場合</li>
            <li>本サービスについて、最終の利用から一定期間利用がない場合</li>
            <li>その他、当社が本サービスの利用を適当でないと判断した場合</li>
          </ul>
        </Section>

        <Section title="第9条（保証の否認および免責事項）">
          <p>
            当社は、本サービスに事実上または法律上の瑕疵
            （安全性、信頼性、正確性、完全性、有効性、特定の目的への適合性、セキュリティなどに関する欠陥、エラーやバグ、権利侵害などを含みます）
            がないことを明示的にも黙示的にも保証しておりません。
          </p>
          <p className="mt-3">
            当社は、本サービスに起因して利用者に生じたあらゆる損害について、一切の責任を負いません。
            ただし、本サービスに関する当社と利用者との間の契約が消費者契約法に定める消費者契約となる場合、
            この免責規定は適用されません。
          </p>
        </Section>

        <Section title="第10条（サービス内容の変更等）">
          <p>
            当社は、利用者に通知することなく、本サービスの内容を変更しまたは本サービスの提供を中止することができるものとし、
            これによって利用者に生じた損害について一切の責任を負いません。
          </p>
        </Section>

        <Section title="第11条（利用規約の変更）">
          <p>
            当社は、必要と判断した場合には、利用者に通知することなくいつでも本規約を変更することができるものとします。
            変更後の利用規約は、本ウェブサイトに掲載した時点から効力を生じます。
          </p>
        </Section>

        <Section title="第12条（個人情報の取扱い）">
          <p>
            当社は、本サービスの利用によって取得する個人情報については、
            当社{" "}
            <Link href="/legal/privacy" className="underline">プライバシーポリシー</Link>
            {" "}に従い適切に取り扱うものとします。
          </p>
        </Section>

        <Section title="第13条（通知または連絡）">
          <p>
            利用者と当社との間の通知または連絡は、当社の定める方法によって行うものとします。
            当社は、利用者から、当社が別途定める方式に従った変更届け出がない限り、
            現在登録されている連絡先が有効なものとみなして当該連絡先へ通知または連絡を行い、
            これらは、発信時に利用者へ到達したものとみなします。
          </p>
        </Section>

        <Section title="第14条（権利義務の譲渡の禁止）">
          <p>
            利用者は、当社の書面による事前の承諾なく、利用契約上の地位または本規約に基づく権利もしくは義務を
            第三者に譲渡し、または担保に供することはできません。
          </p>
        </Section>

        <Section title="第15条（準拠法・裁判管轄）">
          <p>
            本規約の解釈にあたっては、日本法を準拠法とします。
            本サービスに関して紛争が生じた場合には、当社の本店所在地を管轄する裁判所を専属的合意管轄とします。
          </p>
        </Section>

        <Section title="第16条（お問い合わせ）">
          <p>
            本規約に関するお問い合わせは、以下までお願いいたします：
          </p>
          <ul className="list-none mt-2 space-y-1">
            <li>運営会社: evidai</li>
            <li>お問い合わせ: <a className="underline" href="mailto:contact@aievid.com">contact@aievid.com</a></li>
            <li>セキュリティ報告: <a className="underline" href="mailto:security@lemoncake.xyz">security@lemoncake.xyz</a></li>
          </ul>
        </Section>

        <hr className="border-black/10 my-12" />

        <p className="text-sm opacity-60">
          English speakers: a summary of these Terms is available at{" "}
          <Link href="/legal/terms-en" className="underline">lemoncake.xyz/legal/terms-en</Link>.
          The Japanese text above is the controlling version.
        </p>

        <nav className="mt-12 text-sm font-medium flex gap-6">
          <Link href="/legal/dify-plugin" className="hover:underline">Dify Plugin Policy →</Link>
          <Link href="/about" className="hover:underline">About →</Link>
          <Link href="/" className="hover:underline">Home →</Link>
        </nav>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl md:text-2xl font-bold mb-3">{title}</h2>
      <div className="text-base leading-relaxed">{children}</div>
    </section>
  );
}
