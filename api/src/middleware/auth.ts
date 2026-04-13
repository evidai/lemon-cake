/**
 * 管理者リクエスト用JWT認証ミドルウェア
 * エージェントからのPay Token検証は各ルートで個別に行う
 */

import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { HTTPException } from "hono/http-exception";

function getAdminSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export const adminAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing Authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getAdminSecret(), {
      issuer: "kyapay-admin",
    });
    // コンテキストにロールを格納
    c.set("adminId", payload.sub as string);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired admin token" });
  }

  await next();
});
