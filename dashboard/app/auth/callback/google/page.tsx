"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code     = searchParams.get("code");
    const state    = searchParams.get("state");
    const errParam = searchParams.get("error");

    if (errParam) {
      setError("Google 認証がキャンセルされました");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }
    if (!code) {
      setError("認証コードが見つかりません");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/google/callback`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ code, ...(state ? { state } : {}) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Google 認証に失敗しました");
        localStorage.setItem("buyer_token", data.token);
        router.push("/");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Google 認証に失敗しました");
        setTimeout(() => router.push("/login"), 2000);
      }
    })();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <img src="/logo.png" alt="LemonCake" className="w-9 h-9 rounded-xl object-cover" />
          <span className="text-lg font-bold text-gray-900">LemonCake</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {error ? (
            <>
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">認証エラー</p>
              <p className="text-sm text-red-600">{error}</p>
              <p className="text-xs text-gray-400 mt-2">ログインページに戻ります…</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Google 認証中…</p>
              <p className="text-xs text-gray-400">しばらくお待ちください</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense>
      <GoogleCallbackContent />
    </Suspense>
  );
}
