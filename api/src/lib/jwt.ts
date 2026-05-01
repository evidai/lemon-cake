/**
 * KYAPay Pay Token — jose によるJWT発行・検証
 *
 * ペイロード仕様:
 *   sub       : buyerId
 *   jti       : tokenId (DB Token.id と一致)
 *   scope     : "SINGLE" | "ALL" (省略時は SINGLE — 後方互換)
 *   serviceId : 対象サービスID（scope=SINGLE のみ必須）
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

export type PayTokenScope = "SINGLE" | "ALL";

// ─── Pay Token のペイロード型 ────────────────────────────────
export interface PayTokenPayload extends JWTPayload {
  sub:        string;        // buyerId
  jti:        string;        // tokenId
  scope?:     PayTokenScope; // 省略時は SINGLE（後方互換）
  serviceId?: string;        // scope=SINGLE のみ必須
  limitUsdc:  string;        // Decimal文字列 ("5.000000000000000000")
  buyerTag?:  string;
}

// ─── JWT 発行 ────────────────────────────────────────────────
export async function signPayToken(params: {
  tokenId:    string;
  buyerId:    string;
  scope?:     PayTokenScope;  // 省略時は SINGLE
  serviceId?: string;         // scope=SINGLE では必須、ALL では無視
  limitUsdc:  string;
  buyerTag?:  string;
  expiresAt:  Date;
}): Promise<string> {
  const { tokenId, buyerId, scope = "SINGLE", serviceId, limitUsdc, buyerTag, expiresAt } = params;

  if (scope === "SINGLE" && !serviceId) {
    throw new Error("signPayToken: serviceId is required for scope=SINGLE");
  }

  return new SignJWT({
    scope,
    ...(scope === "SINGLE" && serviceId ? { serviceId } : {}),
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

// ─── Incident Contract 署名（Phase 1） ─────────────────────────
// Pay Token の秘密鍵とは独立させ、Pay Token を回しても過去の署名検証が
// 生き続けるようにする。fallback として JWT_SECRET を使うので、本番で
// 独立運用したい場合は INCIDENT_SIGNING_KEY を別途 set する。

function getIncidentSecret(): Uint8Array {
  const secret = process.env.INCIDENT_SIGNING_KEY ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("INCIDENT_SIGNING_KEY (or JWT_SECRET fallback) must be ≥32 chars");
  }
  return new TextEncoder().encode(secret);
}

/**
 * 署名付き incident contract を発行する。
 * - alg: HS256
 * - iss: "kyapay-incident"
 * - 本体の JSON を JWT claim `c` に格納し、返すのは JWS コンパクト表現。
 *   DB には `incidentContract` (object) と `incidentSignature` (JWS) を
 *   それぞれ分離保存する。
 */
export async function signIncidentContract(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT({ c: payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "incident-v0" })
    .setIssuedAt()
    .setIssuer("kyapay-incident")
    .sign(getIncidentSecret());
}

/** JWS を検証して contract 本体を返す。外部ツール検証用のヘルパー。 */
export async function verifyIncidentContract(jws: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(jws, getIncidentSecret(), {
    issuer: "kyapay-incident",
  });
  if (!payload.c || typeof payload.c !== "object") {
    throw new Error("Invalid incident signature: missing contract claim");
  }
  return payload.c as Record<string, unknown>;
}

// ─── Pay Token 検証 ──────────────────────────────────────────
export async function verifyPayToken(token: string): Promise<PayTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer:   "kyapay",
    audience: "kyapay-service",
  });

  // 必須クレームの存在チェック（scope は省略時 SINGLE 扱い）
  if (!payload.jti || !payload.sub || !payload.limitUsdc) {
    throw new Error("Invalid Pay Token: missing required claims");
  }

  const scope: PayTokenScope = payload.scope === "ALL" ? "ALL" : "SINGLE";
  if (scope === "SINGLE" && !payload.serviceId) {
    throw new Error("Invalid Pay Token: serviceId required for scope=SINGLE");
  }

  return { ...payload, scope } as PayTokenPayload;
}
