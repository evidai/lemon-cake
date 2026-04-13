/**
 * Cloud Run サーバーサイドプロキシ
 *
 * ブラウザ → Next.js API Route（このファイル） → Cloud Run API
 *
 * - 開発環境: CLOUD_RUN_URL が未設定 → 何もしない（page.tsx が直接 localhost:3002 を叩く）
 * - 本番環境: CLOUD_RUN_URL を設定 → Google Identity Token を付与して転送
 */

import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL ?? "";

// Google Identity Token 取得（GCP 環境 or サービスアカウントキー）
let _auth: GoogleAuth | null = null;
function getAuth() {
  if (!_auth) {
    _auth = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
      ? new GoogleAuth({
          credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        })
      : new GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/cloud-platform"],
        });
  }
  return _auth;
}

async function getIdentityToken(audience: string): Promise<string> {
  const client = await getAuth().getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  const auth = (headers as unknown as Record<string, string>)["Authorization"] ?? "";
  return auth.replace("Bearer ", "");
}

async function handler(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!CLOUD_RUN_URL) {
    return NextResponse.json({ error: "CLOUD_RUN_URL is not set" }, { status: 502 });
  }

  const path    = params.path.join("/");
  const search  = req.nextUrl.search;
  const target  = `${CLOUD_RUN_URL}/api/${path}${search}`;

  // Identity Token 取得
  let authorization = "";
  try {
    const token = await getIdentityToken(CLOUD_RUN_URL);
    authorization = `Bearer ${token}`;
  } catch (e) {
    console.error("[Proxy] Failed to get identity token:", e);
    return NextResponse.json({ error: "Auth token error" }, { status: 502 });
  }

  // リクエストを転送
  const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();

  const forwardHeaders: Record<string, string> = {
    Authorization: authorization,
    "Content-Type": req.headers.get("content-type") ?? "application/json",
  };
  // 冪等性キーなどカスタムヘッダーを転送
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) forwardHeaders["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(target, {
    method:  req.method,
    headers: forwardHeaders,
    body,
  });

  const resBody = await res.text();

  return new NextResponse(resBody, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    },
  });
}

export const GET    = handler;
export const POST   = handler;
export const PATCH  = handler;
export const DELETE = handler;
