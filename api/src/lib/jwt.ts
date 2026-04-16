/**
 * KYAPay Pay Token — jose によるJWT発行・検証
 *
 * ペイロード仕様:
 *   sub       : buyerId
 *   jti       : tokenId (DB Token.id と一致)
 *   serviceId : 対象サービスID
 *   limitUsdc : 利用上限額（文字列: Decimalの精度を保つため）
 *   buyerTag  : バイヤータグ（任意）
 *   exp       : 有効期限 (Unix timestamp)
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// 環境変数から秘密鍵を取得（32bytes以上推奨）
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

// ─── Pay Token のペイロード型 ────────────────────────────────
export interface PayTokenPayload extends JWTPayload {
  sub:        string;   // buyerId
  jti:        string;   // tokenId
  serviceId:  string;
  limitUsdc:  string;   // Decimal文字列 ("5.000000000000000000")
  buyerTag?:  string;
}

// ─── JWT 発行 ────────────────────────────────────────────────
export async function signPayToken(params: {
  tokenId:    string;
  buyerId:    string;
  serviceId:  string;
  limitUsdc:  string;
  buyerTag?:  string;
  expiresAt:  Date;
}): Promise<string> {
  const { tokenId, buyerId, serviceId, limitUsdc, buyerTag, expiresAt } = params;

  return new SignJWT({
    serviceId,
    limitUsdc,
    ...(buyerTag ? { buyerTag } : {}),
  } satisfies Omit<PayTokenPayload, keyof JWTPayload>)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(buyerId)
    .setJti(tokenId)
    .setIssuedAt()
    .setIssuer("kyapay")
    .setAudience("kyapay-service")
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

// ─── Buyer (User) JWT ────────────────────────────────────────

export interface BuyerTokenPayload extends JWTPayload {
  sub:     string;  // userId
  buyerId: string;
  email:   string;
  name:    string;
}

export async function signBuyerToken(params: {
  userId: string; buyerId: string; email: string; name: string;
}): Promise<string> {
  return new SignJWT({ buyerId: params.buyerId, email: params.email, name: params.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifyBuyerToken(token: string): Promise<BuyerTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  if (!payload.sub || !payload["buyerId"]) throw new Error("Invalid buyer token");
  return payload as BuyerTokenPayload;
}

// ─── Admin JWT ───────────────────────────────────────────────

function getAdminSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_JWT_SECRET must be set independently (min 32 chars) — do not share with JWT_SECRET");
  }
  return new TextEncoder().encode(secret);
}

/** Admin JWT を発行（有効期限 24h） */
export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setIssuer("kyapay-admin")
    .setExpirationTime("24h")
    .sign(getAdminSecret());
}

/** Admin JWT を検証 */
export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getAdminSecret(), {
      issuer: "kyapay-admin",
    });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

// ─── Pay Token 検証 ──────────────────────────────────────────
export async function verifyPayToken(token: string): Promise<PayTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer:   "kyapay",
    audience: "kyapay-service",
  });

  // 必須クレームの存在チェック
  if (!payload.jti || !payload.sub || !payload.serviceId || !payload.limitUsdc) {
    throw new Error("Invalid Pay Token: missing required claims");
  }

  return payload as PayTokenPayload;
}
