import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // ログイン済み（lc_auth cookie あり）のユーザーはダッシュボード(/)をそのまま表示
  // 未ログインユーザーは / → /about にリダイレクト
  if (request.nextUrl.pathname === "/") {
    const authed = request.cookies.get("lc_auth");
    if (!authed) {
      return NextResponse.redirect(new URL("/about", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
