/**
 * POST /api/charge — 課金実行
 * GET  /api/charges — 課金履歴一覧
 *
 * 冪等性キー (Idempotency-Key ヘッダー) を必須とする。
 * 同一キーで2回リクエストが来た場合は既存レコードをそのまま返す。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyPayToken, verifyBuyerToken, signIncidentContract } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";
import { Decimal } from "@prisma/client/runtime/library";
import { getUsdcTransferQueue } from "../lib/queue.js";
import { buildIncidentContract } from "../lib/incident-contract.js";
import { hashInput } from "../lib/hash.js";

export const chargeRouter = new OpenAPIHono();

// ─── Zodスキーマ ─────────────────────────────────────────────

const ChargeBody = z.object({
  // エージェントが提示するPay Token (JWT文字列)
  payToken: z.string().min(10, "payToken is required"),

  // 課金金額 (USDC) — 小数点以下6桁まで（USDC精度準拠）
  amountUsdc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "amountUsdc: up to 6 decimal places (USDC precision)")
    .refine((v) => parseFloat(v) > 0, "amountUsdc must be greater than 0"),

  // ─── Incident contract v0 (all optional) ────────────────────────────────
  // 呼び出し対象の入力データ。ハッシュを contract.execution.input_hash に格納。
  input:            z.unknown().optional(),
  // upstream の HTTP ステータス（呼び出し済みの場合）
  providerStatus:   z.number().int().optional(),
  // upstream レスポンスのハッシュ（プロキシ外で呼んだ場合にクライアントが計算して送る）
  responseHash:     z.string().max(128).optional(),
  // インシデントタグ（bulk revoke / export のキー）
  incidentTag:      z.string().max(128).optional(),
});

const ChargeResponse = z.object({
  chargeId:       z.string(),
  status:         z.enum(["PENDING", "COMPLETED", "FAILED"]),
  amountUsdc:     z.string(),
  idempotencyKey: z.string(),
  txHash:         z.string().nullable(),
  createdAt:      z.string(),
});

const ChargeListItem = ChargeResponse.extend({
  buyerId:   z.string(),
  serviceId: z.string(),
  tokenId:   z.string(),
  riskScore: z.number(),
});

// ─── POST /api/charge ────────────────────────────────────────

const chargeRoute = createRoute({
  method:  "post",
  path:    "/",
  tags:    ["Charges"],
  summary: "課金を実行する",
  description: [
    "AIエージェントがサービスAPIを呼び出した際に課金リクエストを送信します。",
    "",
    "**冪等性キー (Idempotency-Key):** リクエストヘッダーに必須。",
    "同一キーで複数回リクエストが来た場合、2回目以降は既存レコードを返します（重複課金しません）。",
    "",
    "**処理フロー:**",
    "1. Pay Token を検証 (jose)",
    "2. トークンの有効期限・revoke・上限額を確認",
    "3. バイヤー残高確認",
    "4. Charge レコードを PENDING で作成 (冪等性キーのuniqueで重複防止)",
    "5. バイヤー残高を即時デクリメント (楽観的ロック)",
    "6. USDC送金キューに投入（Phase 2: BullMQ）← 現在はプレースホルダー",
  ].join("\n"),
  request: {
    headers: z.object({
      // 冪等性キー: UUID v4推奨
      "idempotency-key": z.string().min(8).max(128),
    }),
    body: {
      content: { "application/json": { schema: ChargeBody } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ChargeResponse } },
      description: "課金受付成功（PENDING）",
    },
    200: {
      content: { "application/json": { schema: ChargeResponse } },
      description: "冪等性: 既存レコードを返却",
    },
    400: { description: "バリデーションエラー" },
    401: { description: "Pay Token 検証失敗" },
    402: { description: "バイヤー残高不足" },
    409: { description: "トークン上限額超過" },
    422: { description: "トークン無効（revoked / 期限切れ）" },
  },
});

chargeRouter.openapi(chargeRoute, async (c) => {
  const idempotencyKey = c.req.header("idempotency-key");
  if (!idempotencyKey) {
    throw new HTTPException(400, { message: "Idempotency-Key header is required" });
  }

  const body = c.req.valid("json");

  // ── 冪等性チェック: 既存レコードがあれば即返す ─────────────
  const existing = await prisma.charge.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    return c.json(
      {
        chargeId:       existing.id,
        status:         existing.status,
        amountUsdc:     existing.amountUsdc.toFixed(6),
        idempotencyKey: existing.idempotencyKey,
        txHash:         existing.txHash,
        createdAt:      existing.createdAt.toISOString(),
      } satisfies z.infer<typeof ChargeResponse>,
      200,
    );
  }

  // ── Pay Token 検証 (jose) ───────────────────────────────────
  let tokenPayload: Awaited<ReturnType<typeof verifyPayToken>>;
  try {
    tokenPayload = await verifyPayToken(body.payToken);
  } catch (err) {
    throw new HTTPException(401, {
      message: `Invalid Pay Token: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }

  const { jti: tokenId, sub: buyerId, serviceId } = tokenPayload;

  // ── DBのTokenレコードを確認 ───────────────────────────────
  const token = await prisma.token.findUnique({ where: { id: tokenId } });
  if (!token) throw new HTTPException(401, { message: "Token record not found" });
  if (token.revoked) throw new HTTPException(422, { message: "Token has been revoked" });
  if (token.expiresAt < new Date()) {
    throw new HTTPException(422, { message: "Token has expired" });
  }

  const amountDecimal = new Decimal(body.amountUsdc);

  // ── トークン上限額チェック ─────────────────────────────────
  const newUsed = token.usedUsdc.add(amountDecimal);
  if (newUsed.greaterThan(token.limitUsdc)) {
    throw new HTTPException(409, {
      message: `Token limit exceeded: limit=${token.limitUsdc.toFixed(6)}, used=${token.usedUsdc.toFixed(6)}, requested=${amountDecimal.toFixed(6)}`,
    });
  }

  // ── バイヤー残高確認（サンドボックストークンはスキップ）────
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });
  if (!token.sandbox && buyer.balanceUsdc.lessThan(amountDecimal)) {
    throw new HTTPException(402, {
      message: `Insufficient balance: ${buyer.balanceUsdc.toFixed(6)} USDC available`,
    });
  }

  // ── トランザクション: Charge作成 + 残高デクリメント + Token使用額更新 ──
  const isSandbox = token.sandbox;
  const charge = await prisma.$transaction(async (tx) => {
    // トランザクション内で最新のトークン状態を再確認（revoke レース対策）
    const fresh = await tx.token.findUnique({
      where: { id: tokenId },
      select: { revoked: true, expiresAt: true },
    });
    if (!fresh || fresh.revoked) {
      throw new HTTPException(422, { message: "Token has been revoked" });
    }
    if (fresh.expiresAt < new Date()) {
      throw new HTTPException(422, { message: "Token has expired" });
    }

    // Charge レコードを作成（sandboxなら即時COMPLETED、実金は動かさない）
    // Incident contract 用フィールドを Token から継承 + リクエストヘッダ/ボディから抽出
    const requestIdHeader = c.req.header("x-request-id") ?? null;
    const inputHash = body.input !== undefined ? hashInput(body.input) : null;

    const charge = await tx.charge.create({
      data: {
        buyerId,
        serviceId,
        tokenId,
        amountUsdc:     amountDecimal,
        idempotencyKey,
        status:         isSandbox ? "COMPLETED" : "PENDING",
        // TODO: リスクスコア算出ロジック (Phase 3)
        riskScore:      0,
        sandbox:        isSandbox,
        // ─── Incident contract fields ─────────────────────────────────
        requestId:      requestIdHeader ?? idempotencyKey,
        workflowId:     token.workflowId,
        agentId:        token.agentId,
        inputHash,
        responseHash:   body.responseHash ?? null,
        providerStatus: body.providerStatus ?? null,
        incidentTag:    body.incidentTag ?? null,
      },
    });

    // バイヤー残高を即時デクリメント（楽観的ロック: 同時リクエストはuniqueキーで防ぐ）
    // sandbox トークンは実残高を動かさない
    if (!isSandbox) {
      await tx.buyer.update({
        where: { id: buyerId },
        data:  { balanceUsdc: { decrement: amountDecimal } },
      });
    }

    // Token の使用済み金額を更新（sandboxでも上限管理は動く）
    await tx.token.update({
      where: { id: tokenId },
      data:  { usedUsdc: { increment: amountDecimal } },
    });

    return charge;
  });

  // ── Phase 2: BullMQ キューにジョブを投入（USDC非同期送金）──
  // SKIP_WORKER=true または sandbox の場合はキューをスキップ
  if (!isSandbox && process.env.SKIP_WORKER !== "true") {
    try {
      const queue = getUsdcTransferQueue();
      await Promise.race([
        queue.add(
          "transfer",
          {
            chargeId:   charge.id,
            buyerId,
            serviceId,
            amountUsdc: amountDecimal.toFixed(6),
          },
          { jobId: charge.id },
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Queue timeout")), 3000)
        ),
      ]);
    } catch (queueErr) {
      console.error("[Charge] Failed to enqueue USDC transfer job:", queueErr);
    }
  } else {
    console.log("[Charge] SKIP_WORKER=true: queue skipped, chargeId:", charge.id);
  }

  // ─── Incident contract v0 emission ──────────────────────────────────────
  // トランザクション後に incident contract を組み立てて署名し、
  // Charge に persist する。失敗してもメインの課金フローは成功扱い
  // （契約は次回調停時に再発行できる）。
  try {
    // 最新の token + charge を引き直して組み立てる（usedUsdc/incrementedを反映）
    const freshToken = await prisma.token.findUnique({ where: { id: tokenId } });
    if (freshToken) {
      const contract = buildIncidentContract({ charge, token: freshToken });
      const signature = await signIncidentContract(contract);
      await prisma.charge.update({
        where: { id: charge.id },
        data:  {
          // Prisma's InputJsonValue cast — contract is a plain JSON object by construction
          incidentContract: contract as unknown as import("@prisma/client").Prisma.InputJsonValue,
          incidentSignature: signature,
        },
      });
    }
  } catch (contractErr) {
    console.error("[Charge] Failed to emit incident contract:", contractErr);
  }

  return c.json(
    {
      chargeId:       charge.id,
      status:         charge.status,
      amountUsdc:     charge.amountUsdc.toFixed(6),
      idempotencyKey: charge.idempotencyKey,
      txHash:         charge.txHash,
      createdAt:      charge.createdAt.toISOString(),
    } satisfies z.infer<typeof ChargeResponse>,
    201,
  );
});

// ─── GET /api/charges ────────────────────────────────────────

const listRoute = createRoute({
  method:  "get",
  path:    "/",
  tags:    ["Charges"],
  summary: "課金履歴を取得する",
  request: {
    query: z.object({
      buyerId:   z.string().cuid().optional(),
      serviceId: z.string().cuid().optional(),
      status:    z.enum(["PENDING", "COMPLETED", "FAILED"]).optional(),
      page:      z.coerce.number().int().min(1).default(1),
      limit:     z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data:  z.array(ChargeListItem),
            total: z.number(),
            page:  z.number(),
          }),
        },
      },
      description: "取得成功",
    },
  },
});

chargeRouter.openapi(listRoute, async (c) => {
  // ── Buyer JWT 認証 ────────────────────────────────────────
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json({ error: "Unauthorized" }, 401) as any;
  }
  let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
  try {
    buyerPayload = await verifyBuyerToken(auth.slice(7));
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c.json({ error: "Invalid token" }, 401) as any;
  }

  const { serviceId, status, page, limit } = c.req.valid("query");
  const buyerId = buyerPayload.buyerId; // 自分の課金履歴のみ取得
  const skip = (page - 1) * limit;

  const where = {
    buyerId, // 常にJWTのbuyerIdでフィルタ
    ...(serviceId ? { serviceId } : {}),
    ...(status    ? { status }    : {}),
  };

  const [charges, total] = await prisma.$transaction([
    prisma.charge.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
    }),
    prisma.charge.count({ where }),
  ]);

  return c.json({
    data: charges.map((ch) => ({
      chargeId:       ch.id,
      status:         ch.status,
      amountUsdc:     ch.amountUsdc.toFixed(6),
      idempotencyKey: ch.idempotencyKey,
      txHash:         ch.txHash,
      createdAt:      ch.createdAt.toISOString(),
      buyerId:        ch.buyerId,
      serviceId:      ch.serviceId,
      tokenId:        ch.tokenId,
      riskScore:      ch.riskScore,
    })),
    total,
    page,
  });
});
