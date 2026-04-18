import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // / にアクセスしたら /about にリダイレクト
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/about", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
