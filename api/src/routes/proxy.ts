/**
 * ANY /api/proxy/:serviceId/* — 課金付きAPIプロキシ
 *
 * Pay Token を検証して pricePerCallUsdc を課金し、
 * Service.endpoint にリクエストをそのまま転送する。
 *
 * 利用例:
 *   POST /api/proxy/<serviceId>/companies
 *   Authorization: Bearer <payToken>
 *   Idempotency-Key: <uuid>
 *   → freee GET /api/1/companies に転送
 */

import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { verifyPayToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";
import { Decimal } from "@prisma/client/runtime/library";
import { getUsdcTransferQueue } from "../lib/queue.js";
import { randomUUID } from "crypto";

export const proxyRouter = new Hono();

// ─── ANY /api/proxy/:serviceId/* ─────────────────────────────

proxyRouter.all("/:serviceId/*", async (c) => {
  // ── 1. Pay Token 検証 ────────────────────────────────────────
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Authorization: Bearer <payToken> が必要です" });
  }

  let tokenPayload: Awaited<ReturnType<typeof verifyPayToken>>;
  try {
    tokenPayload = await verifyPayToken(authHeader.slice(7));
  } catch (err) {
    throw new HTTPException(401, {
      message: `Invalid Pay Token: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }

  const { jti: tokenId, sub: buyerId, serviceId: tokenServiceId } = tokenPayload;

  // ── 2. パスの serviceId と Token の serviceId が一致することを確認 ─
  const serviceId = c.req.param("serviceId");
  if (tokenServiceId !== serviceId) {
    throw new HTTPException(403, {
      message: `このトークンはサービス ${tokenServiceId} 用です。${serviceId} へのアクセスは許可されていません。`,
    });
  }

  // ── 3. サービスレコードを取得 ────────────────────────────────
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: { provider: { select: { walletAddress: true } } },
  });
  if (!service) throw new HTTPException(404, { message: "Service not found" });
  if (!service.verified) throw new HTTPException(403, { message: "Service is not approved yet" });
  if (!service.endpoint) throw new HTTPException(501, { message: "このサービスはプロキシ未対応です（endpoint 未設定）" });

  // ── 4. DB の Token レコードを確認 ────────────────────────────
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new HTTPException(401, { message: "Token record not found" });
  if (token.revoked) throw new HTTPException(422, { message: "Token has been revoked" });
  if (token.expiresAt < new Date()) throw new HTTPException(422, { message: "Token has expired" });

  const amountDecimal = service.pricePerCallUsdc;

  // ── 5. トークン上限チェック ──────────────────────────────────
  const newUsed = token.usedUsdc.add(amountDecimal);
  if (newUsed.greaterThan(token.limitUsdc)) {
    throw new HTTPException(409, {
      message: `Token limit exceeded: limit=${token.limitUsdc.toFixed(6)}, used=${token.usedUsdc.toFixed(6)}, cost=${amountDecimal.toFixed(6)}`,
    });
  }

  // ── 6. バイヤー残高確認 ──────────────────────────────────────
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });
  if (buyer.balanceUsdc.lessThan(amountDecimal)) {
    throw new HTTPException(402, {
      message: `Insufficient balance: ${buyer.balanceUsdc.toFixed(6)} USDC available`,
    });
  }

  // ── 7. 冪等性キー — 未指定時は自動生成 ──────────────────────
  const idempotencyKey = c.req.header("Idempotency-Key") ?? `proxy-${randomUUID()}`;

  // 同一キーのChargeが既に存在する場合は課金をスキップ（再試行安全性）
  const existingCharge = await prisma.charge.findUnique({ where: { idempotencyKey } });

  let chargeId: string;
  if (existingCharge) {
    chargeId = existingCharge.id;
  } else {
    // ── 8. トランザクション: Charge 作成 + 残高デクリメント ───
    const charge = await prisma.$transaction(async (tx) => {
      const ch = await tx.charge.create({
        data: {
          buyerId,
          serviceId,
          tokenId,
          amountUsdc:     amountDecimal,
          idempotencyKey,
          status:         "PENDING",
          riskScore:      0,
        },
      });
      await tx.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: { decrement: amountDecimal } },
      });
      await tx.token.update({
        where: { id: tokenId },
        data:  { usedUsdc: { increment: amountDecimal } },
      });
      return ch;
    });
    chargeId = charge.id;

    // BullMQ キューに投入
    if (process.env.SKIP_WORKER !== "true") {
      try {
        const queue = getUsdcTransferQueue();
        await Promise.race([
          queue.add(
            "transfer",
            { chargeId, buyerId, serviceId, amountUsdc: amountDecimal.toFixed(6) },
            { jobId: chargeId },
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Queue timeout")), 3000)),
        ]);
      } catch (queueErr) {
        console.error("[Proxy] Failed to enqueue USDC transfer:", queueErr);
      }
    }
  }

  // ── 9. 上流サービスにリクエスト転送 ─────────────────────────
  const clientSearch = new URL(c.req.url).searchParams;

  // Jina Reader 特殊処理:
  //   ?url=https://example.com → https://r.jina.ai/https://example.com
  // HTTP クライアントが // をパスに含めると / に正規化されるため、
  // クエリパラメータ経由で受け取りパスに展開する。
  let pathSuffix: string;
  const urlParam = clientSearch.get("url");
  if (urlParam && service.endpoint?.includes("r.jina.ai")) {
    pathSuffix = "/" + urlParam;
    clientSearch.delete("url");
  } else {
    pathSuffix = c.req.path.replace(`/api/proxy/${serviceId}`, "") || "/";
  }
  const upstreamUrl = service.endpoint.replace(/\/$/, "") + pathSuffix;

  // authHeader の3形式:
  //   "Bearer xxx"            → Authorization ヘッダー
  //   "X-Custom-Header:value" → 任意ヘッダー
  //   "QUERY:param:value"     → クエリパラメータとして注入（APIキーをエージェントに隠す）
  let queryAuthParam: [string, string] | null = null;
  const forwardHeaders: Record<string, string> = {
    "Content-Type": c.req.header("Content-Type") ?? "application/json",
    "Accept":       c.req.header("Accept") ?? "application/json",
    "X-Charge-Id":  chargeId,
  };
  if (service.authHeader) {
    if (service.authHeader.startsWith("QUERY:")) {
      // QUERY:param_name:value → クエリパラメータとして付加
      const parts = service.authHeader.slice(6).split(":");
      queryAuthParam = [parts[0], parts.slice(1).join(":")];
    } else if (service.authHeader.startsWith("Bearer ") || !service.authHeader.includes(":")) {
      forwardHeaders["Authorization"] = service.authHeader;
    } else {
      const idx = service.authHeader.indexOf(":");
      forwardHeaders[service.authHeader.slice(0, idx).trim()] = service.authHeader.slice(idx + 1).trim();
    }
  }

  if (queryAuthParam) clientSearch.set(queryAuthParam[0], queryAuthParam[1]);
  const forwardUrl = upstreamUrl + (clientSearch.toString() ? "?" + clientSearch.toString() : "");

  const method = c.req.method;

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await c.req.text() : undefined;

  const doFetch = (headers: Record<string, string>) =>
    fetch(forwardUrl, { method, headers, ...(hasBody && body ? { body } : {}) });

  let upstreamRes: Response;
  try {
    upstreamRes = await doFetch(forwardHeaders);

    // 401 → 自動リフレッシュして 1 回だけリトライ（freee のみ）
    if (upstreamRes.status === 401 && service.endpoint) {
      const ep = service.endpoint;

      // freee (platform-level proxy token refresh)
      if (ep.includes("api.freee.co.jp")) {
        console.log("[Proxy] freee 401 — attempting token refresh");
        try {
          const { refreshAndPersistFreeeToken } = await import("../lib/freee.js");
          const newToken = await refreshAndPersistFreeeToken();
          forwardHeaders["Authorization"] = `Bearer ${newToken}`;
          upstreamRes = await doFetch(forwardHeaders);
        } catch (e) { console.error("[Proxy] freee token refresh failed:", e); }
      }
    }
  } catch (err) {
    console.error("[Proxy] Upstream fetch error:", err);
    throw new HTTPException(502, { message: `Upstream error: ${err instanceof Error ? err.message : "network error"}` });
  }

  const upstreamBody = await upstreamRes.text();
  const contentType  = upstreamRes.headers.get("Content-Type") ?? "application/json";

  return new Response(upstreamBody, {
    status:  upstreamRes.status,
    headers: {
      "Content-Type":  contentType,
      "X-Charge-Id":   chargeId,
      "X-Amount-Usdc": amountDecimal.toFixed(6),
    },
  });
});
