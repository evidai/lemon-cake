"use client";
import { useState } from "react";

type Status = "idle" | "sending" | "ok" | "error";

export default function SupportForm() {
  const [form, setForm] = useState({ name: "", company: "", title: "", email: "", type: "intro", message: "" });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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

  if (status === "ok") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-7 text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-7 h-7 text-emerald-400">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div>
          <p className="text-white font-bold text-xl">送信しました</p>
          <p className="text-white/40 text-sm mt-1">1〜2営業日以内にご連絡します</p>
        </div>
        <a href="/" className="mt-2 px-5 py-2 bg-white/8 border border-white/12 rounded-xl text-sm text-white/70 hover:bg-white/12 transition-colors">
          トップへ戻る
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">お名前 <span className="text-red-400">*</span></label>
        <input
          required value={form.name} onChange={set("name")}
          placeholder="山田 太郎"
          className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">メールアドレス <span className="text-red-400">*</span></label>
        <input
          required type="email" value={form.email} onChange={set("email")}
          placeholder="you@example.com"
          className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors"
        />
      </div>

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

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">メッセージ <span className="text-red-400">*</span></label>
        <textarea
          required value={form.message} onChange={set("message")}
          placeholder="お問い合わせ内容をご記入ください"
          rows={6}
          className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/25 focus:bg-white/8 transition-colors resize-none"
        />
      </div>

      {status === "error" && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">{errorMsg}</p>
      )}

      <button
        type="submit" disabled={status === "sending"}
        className="w-full py-3 bg-[#fffd43] text-[#1a0f00] font-bold rounded-xl hover:bg-[#f0eb40] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
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
  );
}
