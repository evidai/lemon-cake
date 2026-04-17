/**
 * LemonCake API クライアント
 *
 * - Pay Token 発行（POST /api/tokens）
 * - プロキシ経由のサービス呼び出し（ANY /api/proxy/:serviceId/:path）
 * - 残高確認（GET /api/auth/me）
 *
 * 事前発行済みトークンがあればそれを使い、
 * なければ buyerJwt で都度発行するフォールバックロジックを含む。
 */

import { elizaLogger } from "@elizaos/core";
import {
  LemoncakeConfig,
  IssueTokenRequest,
  IssueTokenResponse,
  CallServiceRequest,
  CallServiceResponse,
  LemoncakeError,
  ApiErrorBody,
} from "../types.js";

// ─── HTTP ヘルパー ────────────────────────────────────────────────────────

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LemoncakeError("NETWORK_ERROR", `${label}: network error — ${msg}`, true);
  }

  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    throw new LemoncakeError("PARSE_ERROR", `${label}: failed to parse response (status ${res.status})`);
  }

  if (res.ok) return body as T;

  // エラーレスポンスを構造化
  const errBody = (typeof body === "object" && body !== null ? body : {}) as ApiErrorBody;
  const errMsg  = errBody.error ?? errBody.message ?? String(body);

  switch (res.status) {
    case 401:
      throw new LemoncakeError("TOKEN_EXPIRED", `${label}: authentication failed — ${errMsg}`);
    case 402:
      throw new LemoncakeError("TOKEN_LIMIT_EXCEEDED", `${label}: payment required — ${errMsg}`);
    case 403:
      throw new LemoncakeError("SERVICE_NOT_APPROVED", `${label}: service not approved — ${errMsg}`);
    case 404:
      throw new LemoncakeError("SERVICE_NOT_FOUND", `${label}: not found — ${errMsg}`);
    case 429: {
      const retryAfter = errBody.retryAfter ?? 60;
      throw new LemoncakeError(
        "RATE_LIMITED",
        `${label}: rate limited — retry after ${retryAfter}s`,
        true,
        retryAfter,
      );
    }
    default:
      throw new LemoncakeError("API_ERROR", `${label}: API error ${res.status} — ${errMsg}`);
  }
}

// ─── クライアント ─────────────────────────────────────────────────────────

export class LemoncakeClient {
  private readonly apiUrl: string;
  private readonly payToken: string | null;
  private readonly buyerJwt: string | null;

  constructor(config: LemoncakeConfig) {
    this.apiUrl   = config.apiUrl.replace(/\/$/, "");
    this.payToken = config.payToken;
    this.buyerJwt = config.buyerJwt;
  }

  // ─── Pay Token 取得（事前発行 or 都度発行） ──────────────────────────

  /**
   * 有効な Pay Token JWT を取得する。
   *
   * 優先順位:
   *   1. LEMONCAKE_PAY_TOKEN が設定されていればそれを返す（API呼び出しなし）
   *   2. LEMONCAKE_BUYER_JWT で /api/tokens を叩いて新規発行
   */
  async resolvePayToken(req: IssueTokenRequest): Promise<string> {
    // ── パターン1: 事前発行済みトークン ──────────────────────────────
    if (this.payToken) {
      elizaLogger.debug("[LemonCake] Using pre-issued Pay Token");
      return this.payToken;
    }

    // ── パターン2: 都度発行 ──────────────────────────────────────────
    if (!this.buyerJwt) {
      throw new LemoncakeError(
        "CREDENTIAL_MISSING",
        "Neither LEMONCAKE_PAY_TOKEN nor LEMONCAKE_BUYER_JWT is configured. " +
        "Set at least one in your .env or character settings.",
      );
    }

    elizaLogger.debug({ serviceId: req.serviceId, limitUsdc: req.limitUsdc }, "[LemonCake] Issuing Pay Token on-demand");

    const issued = await fetchJson<IssueTokenResponse>(
      `${this.apiUrl}/api/tokens`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${this.buyerJwt}`,
        },
        body: JSON.stringify(req),
      },
      "issuePayToken",
    );

    elizaLogger.info({
      tokenId:   issued.tokenId,
      serviceId: issued.serviceId,
      limitUsdc: issued.limitUsdc,
      expiresAt: issued.expiresAt,
    }, "[LemonCake] Pay Token issued");

    return issued.jwt;
  }

  // ─── サービス呼び出し ─────────────────────────────────────────────────

  async callService(
    payTokenJwt: string,
    req: CallServiceRequest,
  ): Promise<CallServiceResponse> {
    const subPath = (req.path ?? "/").replace(/^([^/])/, "/$1");
    const url     = `${this.apiUrl}/api/proxy/${encodeURIComponent(req.serviceId)}${subPath}`;
    const method  = req.method ?? "POST";

    elizaLogger.debug({ serviceId: req.serviceId, path: subPath, method }, "[LemonCake] Calling service");

    const headers: Record<string, string> = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${payTokenJwt}`,
    };
    if (req.idempotencyKey) {
      headers["Idempotency-Key"] = req.idempotencyKey;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        ...(req.body && ["POST", "PUT", "PATCH"].includes(method)
          ? { body: JSON.stringify(req.body) }
          : {}),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new LemoncakeError("NETWORK_ERROR", `callService: network error — ${msg}`, true);
    }

    const chargeId   = res.headers.get("X-Charge-Id");
    const amountUsdc = res.headers.get("X-Amount-Usdc");

    let responseBody: unknown;
    try {
      const ct = res.headers.get("content-type") ?? "";
      responseBody = ct.includes("application/json") ? await res.json() : await res.text();
    } catch {
      responseBody = null;
    }

    if (res.status === 402) {
      // 予算超過は retryable ではない — エージェントに伝える
      throw new LemoncakeError(
        "TOKEN_LIMIT_EXCEEDED",
        `callService: Pay Token budget exhausted${amountUsdc ? ` (last charge: $${amountUsdc} USDC)` : ""}`,
      );
    }

    if (!res.ok) {
      const errBody = (typeof responseBody === "object" && responseBody !== null
        ? responseBody
        : {}) as ApiErrorBody;
      throw new LemoncakeError(
        "API_ERROR",
        `callService: upstream error ${res.status} — ${errBody.error ?? errBody.message ?? "unknown"}`,
      );
    }

    elizaLogger.info({
      serviceId: req.serviceId,
      chargeId,
      amountUsdc,
    }, "[LemonCake] Service call success");

    return { status: res.status, chargeId, amountUsdc, response: responseBody };
  }

  // ─── 残高確認 ─────────────────────────────────────────────────────────

  async getBalance(): Promise<{ balanceUsdc: string; kycTier: string; email: string }> {
    if (!this.buyerJwt) {
      throw new LemoncakeError(
        "CREDENTIAL_MISSING",
        "LEMONCAKE_BUYER_JWT is required to check balance.",
      );
    }
    return fetchJson(
      `${this.apiUrl}/api/auth/me`,
      { headers: { Authorization: `Bearer ${this.buyerJwt}` } },
      "getBalance",
    );
  }
}
