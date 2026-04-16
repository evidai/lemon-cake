/**
 * POST /api/tokens — Pay Token 発行
 * GET  /api/tokens — 発行済みトークン一覧（バイヤー別）
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { signPayToken, verifyBuyerToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";
import { Decimal } from "@prisma/client/runtime/library";

export const tokensRouter = new OpenAPIHono();

// ─── Zodスキーマ定義 ────────────────────────────────────────

const IssueTokenBody = z.object({
  // buyerId は JWT から自動取得。後方互換のため残すが無視される
  buyerId:    z.string().optional(),
  serviceId:  z.string().min(1, "serviceId is required"),
  limitUsdc:  z
    .string()
    .regex(/^\d+(\.\d+)?$/, "limitUsdc must be a positive decimal string")
    .refine((v) => parseFloat(v) > 0, "limitUsdc must be greater than 0"),
  buyerTag:   z.string().max(64).optional(),
  // 有効期限: ISO8601文字列。未指定なら30日後
  expiresAt:  z.string().datetime().optional(),
});

const TokenResponse = z.object({
  tokenId:   z.string(),
  jwt:       z.string(),
  buyerId:   z.string(),
  serviceId: z.string(),
  limitUsdc: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

const TokenListItem = z.object({
  id:        z.string(),
  serviceId: z.string(),
  limitUsdc: z.string(),
  usedUsdc:  z.string(),
  buyerTag:  z.string().nullable(),
  expiresAt: z.string(),
  revoked:   z.boolean(),
  createdAt: z.string(),
});

// ─── POST /api/tokens ───────────────────────────────────────

const issueRoute = createRoute({
  method:  "post",
  path:    "/",
  tags:    ["Tokens"],
  summary: "Pay Token を発行する",
  description:
    "指定したバイヤーとサービスに対してJWT形式のPay Tokenを発行します。" +
    "エージェントはこのトークンをAPIコール時に Authorization ヘッダーに付与します。",
  request: {
    body: {
      content: { "application/json": { schema: IssueTokenBody } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: TokenResponse } },
      description: "発行成功",
    },
    400: { description: "バリデーションエラー" },
    402: { description: "バイヤー残高不足" },
    404: { description: "バイヤーまたはサービスが存在しない" },
  },
});

tokensRouter.openapi(issueRoute, async (c) => {
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

  const body = c.req.valid("json");
  const buyerId = buyerPayload.buyerId; // JWTから取得（bodyのbuyerIdは無視）
  console.log("[POST /api/tokens] buyerId from JWT:", buyerId, "body:", JSON.stringify(body));

  // ── バイヤーの存在・停止確認 ──────────────────────────────
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  console.log("[POST /api/tokens] buyer:", buyer ? `found (suspended=${buyer.suspended}, balance=${buyer.balanceUsdc})` : "NOT FOUND");
  if (!buyer) throw new HTTPException(404, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });

  // ── サービスの存在・承認確認 ──────────────────────────────
  const service = await prisma.service.findUnique({ where: { id: body.serviceId } });
  console.log("[POST /api/tokens] service:", service ? `found (reviewStatus=${service.reviewStatus})` : "NOT FOUND");
  if (!service) throw new HTTPException(404, { message: "Service not found" });
  if (service.reviewStatus !== "APPROVED") {
    throw new HTTPException(403, { message: `Service is not approved (status: ${service.reviewStatus})` });
  }

  // ── 残高確認（上限額がバイヤー残高を超えていないか）────────
  const limitDecimal = new Decimal(body.limitUsdc);
  if (buyer.balanceUsdc.lessThan(limitDecimal)) {
    throw new HTTPException(402, {
      message: `Insufficient balance: ${buyer.balanceUsdc.toFixed(6)} USDC available`,
    });
  }

  // ── 有効期限の決定 ────────────────────────────────────────
  const expiresAt = body.expiresAt
    ? new Date(body.expiresAt)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // デフォルト30日

  if (expiresAt <= new Date()) {
    throw new HTTPException(400, { message: "expiresAt must be in the future" });
  }

  // ── DBにTokenレコードを作成（IDをjtiとして使用）────────────
  const token = await prisma.token.create({
    data: {
      buyerId:   buyerId,
      serviceId: body.serviceId,
      limitUsdc: limitDecimal,
      buyerTag:  body.buyerTag ?? null,
      expiresAt,
    },
  });

  // ── JWTを署名・発行 ───────────────────────────────────────
  const jwt = await signPayToken({
    tokenId:   token.id,
    buyerId:   buyerId,
    serviceId: body.serviceId,
    limitUsdc: limitDecimal.toFixed(18),
    buyerTag:  body.buyerTag,
    expiresAt,
  });

  return c.json(
    {
      tokenId:   token.id,
      jwt,
      buyerId:   token.buyerId,
      serviceId: token.serviceId,
      limitUsdc: token.limitUsdc.toFixed(6),
      expiresAt: token.expiresAt.toISOString(),
      createdAt: token.createdAt.toISOString(),
    } satisfies z.infer<typeof TokenResponse>,
    201,
  );
});

// ─── GET /api/tokens?buyerId=xxx ────────────────────────────

const listRoute = createRoute({
  method:  "get",
  path:    "/",
  tags:    ["Tokens"],
  summary: "発行済みトークン一覧を取得する",
  request: {
    query: z.object({
      buyerId: z.string().cuid().optional(),
      page:    z.coerce.number().int().min(1).default(1),
      limit:   z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data:  z.array(TokenListItem),
            total: z.number(),
            page:  z.number(),
          }),
        },
      },
      description: "取得成功",
    },
  },
});

tokensRouter.openapi(listRoute, async (c) => {
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

  const { page, limit } = c.req.valid("query");
  const buyerId = buyerPayload.buyerId;
  // buyerIdが空なら全件返してしまうため必ず存在チェック
  if (!buyerId) return c.json({ error: "Unauthorized" }, 401) as never;
  const skip = (page - 1) * limit;

  const [tokens, total] = await prisma.$transaction([
    prisma.token.findMany({
      where:   { buyerId },   // 常にbuyerIdでフィルタ（全件漏洩防止）
      orderBy: { createdAt: "desc" },
      skip,
      take:    limit,
    }),
    prisma.token.count({ where: { buyerId } }),
  ]);

  return c.json({
    data: tokens.map((t) => ({
      id:        t.id,
      serviceId: t.serviceId,
      limitUsdc: t.limitUsdc.toFixed(6),
      usedUsdc:  t.usedUsdc.toFixed(6),
      buyerTag:  t.buyerTag,
      expiresAt: t.expiresAt.toISOString(),
      revoked:   t.revoked,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
  });
});
