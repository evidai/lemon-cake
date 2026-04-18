"use client";

import { useEffect } from "react";

/**
 * /about ページに飛ばされた既存ログイン済みユーザー（localStorage に buyer_token あり・
 * lc_auth cookie 無し）を検出し、cookie を補填してダッシュボード(/)に戻す。
 */
export default function AuthedRedirect() {
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("buyer_token") : null;
    if (!token) return;
    const hasCookie = document.cookie.split("; ").some(c => c.startsWith("lc_auth="));
    if (!hasCookie) {
      document.cookie = `lc_auth=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Strict`;
      window.location.href = "/";
    }
  }, []);
  return null;
}
