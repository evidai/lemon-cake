"use client";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

type Status = "idle" | "sending" | "ok" | "error";

export default function ContactModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: "", company: "", title: "", email: "", type: "intro", message: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "エラー");
      setStatus("ok");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "送信に失敗しました");
      setStatus("error");
    }
  }

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-lg bg-[#0f0f14] border border-white/10 sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header — fixed */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-white/8 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-white">お問い合わせ</h2>
            <p className="text-[12px] text-white/40 mt-0.5">通常1〜2営業日以内にご返信します</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/6 hover:bg-white/12 transition-colors text-white/60 hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {status === "ok" ? (
            <div className="flex flex-col items-center justify-center py-16 px-7 text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 text-emerald-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-lg">送信しました</p>
                <p className="text-white/40 text-sm mt-1">1〜2営業日以内にご連絡します</p>
              </div>
              <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/8 border border-white/12 rounded-xl text-sm text-white/70 hover:bg-white/12 transition-colors">
                閉じる
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="px-7 py-6 flex flex-col gap-4">
              {/* お名前 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">お名前 <span className="text-red-400">*</span></label>
                <input
                  required value={form.name} onChange={set("name")}
                  placeholder="山田 太郎"
                  className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
                />
              </div>

              {/* 会社名 + 役職 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">会社名 <span className="text-red-400">*</span></label>
                  <input
                    required value={form.company} onChange={set("company")}
                    placeholder="株式会社〇〇"
                    className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">役職 <span className="text-red-400">*</span></label>
                  <input
                    required value={form.title} onChange={set("title")}
                    placeholder="CTO / エンジニア"
                    className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
                  />
                </div>
              </div>

              {/* メール */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">メールアドレス <span className="text-red-400">*</span></label>
                <input
                  required type="email" value={form.email} onChange={set("email")}
                  placeholder="you@example.com"
                  className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
                />
              </div>

              {/* 種別 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">お問い合わせ種別 <span className="text-red-400">*</span></label>
                <select
                  value={form.type} onChange={set("type")}
                  className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors appearance-none"
                >
                  <option value="intro">導入・採用相談</option>
                  <option value="tech">技術・API相談</option>
                  <option value="partnership">パートナーシップ</option>
                  <option value="demo">デモのリクエスト</option>
                  <option value="other">その他</option>
                </select>
              </div>

              {/* メッセージ */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">メッセージ <span className="text-red-400">*</span></label>
                <textarea
                  required value={form.message} onChange={set("message")}
                  placeholder="お問い合わせ内容をご記入ください"
                  rows={4}
                  className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors resize-none"
                />
              </div>

              {status === "error" && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">{errorMsg}</p>
              )}

              <button
                type="submit" disabled={status === "sending"}
                className="w-full py-3 bg-[#fffd43] text-[#1a0f00] font-bold rounded-xl hover:bg-[#f0eb40] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1 mb-2"
              >
                {status === "sending" ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    送信中…
                  </>
                ) : "送信する"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modal, document.body);
}
