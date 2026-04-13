/**
 * KYAPay JWT Integration
 *
 * Implements Skyfire's KYAPay protocol for agent identity verification.
 * Spec: https://github.com/skyfire-xyz/kyapay
 *
 * KYA (Know Your Agent) tokens are JWTs that:
 *   1. Identify the agent (sub = agent public key or DID)
 *   2. Declare its compliance tier ("kya" | "kyc")
 *   3. Optionally carry spending authorization (pay_limit, currency)
 *   4. Are signed by Skyfire's identity service (or self-signed in dev)
 *
 * In production: verify the token against Skyfire's JWKS endpoint.
 * In development: accept self-signed tokens with a local secret.
 */

import { Request, Response, NextFunction } from "express";
import * as crypto from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KYAPayload {
  sub: string;           // agent identifier (publicKey or DID)
  iss: string;           // issuer ("skyfire" | "self")
  iat: number;
  exp: number;
  tier: "none" | "kya" | "kyc";
  pay_limit?: number;    // max single-payment authorization
  currency?: string;     // authorized currency
  org?: string;          // optional: organization the agent belongs to
}

export interface KYAVerifyResult {
  valid: boolean;
  payload?: KYAPayload;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEV_SECRET = process.env.KYA_DEV_SECRET ?? "skyfire-dev-secret-change-in-prod";
const SKYFIRE_ISSUER = "skyfire";
const SELF_ISSUER = "self";
const TOKEN_TTL_SECONDS = 3600; // 1 hour default

// ─── Pure JWT helpers (no external deps — base64url + HMAC-SHA256) ────────────

function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Buffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmacSha256(secret: string, data: string): Buffer {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

// ─── KYA Token Generation (dev / self-issued) ─────────────────────────────────

/**
 * Issue a self-signed KYA JWT for an agent.
 * In production this token would be issued by Skyfire's identity service.
 */
export function issueKYAToken(
  agentPublicKey: string,
  tier: KYAPayload["tier"] = "kya",
  options: { payLimit?: number; currency?: string; org?: string } = {}
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: KYAPayload = {
    sub: agentPublicKey,
    iss: SELF_ISSUER,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    tier,
    ...(options.payLimit !== undefined && { pay_limit: options.payLimit }),
    ...(options.currency && { currency: options.currency }),
    ...(options.org && { org: options.org }),
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signing = `${headerB64}.${payloadB64}`;
  const sig = base64urlEncode(hmacSha256(DEV_SECRET, signing));
  return `${signing}.${sig}`;
}

// ─── KYA Token Verification ───────────────────────────────────────────────────

/**
 * Verify a KYA JWT.
 * - Validates HMAC-SHA256 signature (dev mode)
 * - Checks expiry
 * - Returns the decoded payload on success
 *
 * TODO (production): replace HMAC verification with JWKS fetch from Skyfire.
 */
export function verifyKYAToken(token: string): KYAVerifyResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false, error: "Malformed JWT" };

    const [headerB64, payloadB64, sigB64] = parts;
    const signing = `${headerB64}.${payloadB64}`;
    const expected = base64urlEncode(hmacSha256(DEV_SECRET, signing));

    if (expected !== sigB64) {
      return { valid: false, error: "Invalid signature" };
    }

    const payload = JSON.parse(base64urlDecode(payloadB64).toString("utf8")) as KYAPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${String(err)}` };
  }
}

// ─── Express Middleware ───────────────────────────────────────────────────────

/**
 * Optional KYA middleware — attaches `req.kyaPayload` if a valid token is present.
 * Does NOT block requests without a token (use `requireKYA` for enforcement).
 */
export function attachKYA(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  const skyHeader = req.headers["skyfire-pay-id"] as string | undefined;
  const rawToken = skyHeader ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined);

  if (rawToken) {
    const result = verifyKYAToken(rawToken);
    if (result.valid && result.payload) {
      (req as KYARequest).kyaPayload = result.payload;
    }
  }
  next();
}

/**
 * Enforcing KYA middleware — blocks requests without a valid KYA token.
 * Use on routes that require agent identity verification.
 */
export function requireKYA(minTier: "kya" | "kyc" = "kya") {
  const tierRank: Record<string, number> = { none: 0, kya: 1, kyc: 2 };

  return (req: Request, res: Response, next: NextFunction): void => {
    const kyaReq = req as KYARequest;
    if (!kyaReq.kyaPayload) {
      res.status(401).json({ error: "KYA token required" });
      return;
    }
    if ((tierRank[kyaReq.kyaPayload.tier] ?? 0) < (tierRank[minTier] ?? 0)) {
      res.status(403).json({ error: `KYA tier '${minTier}' required, got '${kyaReq.kyaPayload.tier}'` });
      return;
    }
    next();
  };
}

// ─── Type augmentation ────────────────────────────────────────────────────────

export interface KYARequest extends Request {
  kyaPayload?: KYAPayload;
}
