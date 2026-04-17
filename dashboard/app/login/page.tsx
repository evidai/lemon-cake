"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const API_URL_FOR_OAUTH = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";


export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function doLogin(e: string, p: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/buyer-login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: e, password: p }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ログインに失敗しました");
      localStorage.setItem("buyer_token", data.token);
      window.location.href = "/";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 bg-white transition-all";

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <Link href="/about">
            <img src="/logo.png" alt="LemonCake" className="w-9 h-9 rounded-xl object-cover hover:opacity-80 transition-opacity" />
          </Link>
          <Link href="/about" className="text-lg font-bold text-gray-900 hover:text-gray-600 transition-colors">LemonCake</Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">ログイン</h1>
          <p className="text-sm text-gray-500 mb-6">アカウントにサインインしてください。</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">メールアドレス</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className={inputCls} placeholder="you@example.com" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">パスワード</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className={inputCls} placeholder="••••••••" required />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 mt-1">
              {loading ? "ログイン中…" : "ログイン"}
            </button>
          </form>

          {/* Google OAuth */}
          <div className="mt-4">
            <div className="relative flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-200"/>
              <span className="text-xs text-gray-400">または</span>
              <div className="flex-1 h-px bg-gray-200"/>
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = `${API_URL_FOR_OAUTH}/api/auth/google`; }}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google でログイン
            </button>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6">
            アカウントをお持ちでない方は{" "}
            <Link href="/register" className="text-gray-900 font-semibold hover:underline">新規登録</Link>
          </p>
        </div>

      </div>
    </div>
  );
}
