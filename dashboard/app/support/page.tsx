import type { Metadata } from "next";
import SupportForm from "./SupportForm";

export const metadata: Metadata = {
  title: "サポート・お問い合わせ | LemonCake",
  description: "LemonCake の導入・技術・パートナーシップに関するお問い合わせフォーム。通常1〜2営業日以内にご返信します。",
};

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12 sm:py-20">
        {/* Header */}
        <div className="mb-10">
          <a href="/" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-6">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            トップへ戻る
          </a>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">サポート</h1>
          <p className="text-white/60 mt-3 text-sm sm:text-base leading-relaxed">
            LemonCake の導入・技術相談・パートナーシップに関するご質問はこちらから。<br className="hidden sm:inline" />
            通常1〜2営業日以内にご返信します。
          </p>
        </div>

        {/* Quick contact options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          <a
            href="mailto:contact@lemoncake.xyz"
            className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-2xl px-4 py-3.5 hover:bg-white/8 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#fffd43]/15 border border-[#fffd43]/25 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-[#fffd43]">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">メール</p>
              <p className="text-sm text-white font-medium truncate">contact@lemoncake.xyz</p>
            </div>
          </a>
          <a
            href="https://github.com/evidai/lemon-cake/issues"
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-2xl px-4 py-3.5 hover:bg-white/8 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.22.7.83.58C20.56 22.3 24 17.8 24 12.5 24 5.87 18.63.5 12 .5z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">GitHub Issues</p>
              <p className="text-sm text-white font-medium truncate">バグ報告・機能要望</p>
            </div>
          </a>
        </div>

        {/* Form */}
        <div className="bg-[#0f0f14] border border-white/10 rounded-3xl p-6 sm:p-8">
          <div className="mb-6">
            <h2 className="text-lg font-black text-white">お問い合わせフォーム</h2>
            <p className="text-[12px] text-white/40 mt-0.5">必須項目をご記入の上、送信してください</p>
          </div>
          <SupportForm />
        </div>

        {/* FAQ hint */}
        <p className="text-center text-xs text-white/30 mt-8">
          ご返信まで数日お時間をいただく場合があります。お急ぎの場合は件名にその旨ご記入ください。
        </p>
      </div>
    </main>
  );
}
