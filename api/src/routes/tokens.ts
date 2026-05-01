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
  // scope=SINGLE（既存挙動）では必須、scope=ALL では無視される
  serviceId:  z.string().min(1).optional(),
  // トークンのスコープ。省略時は SINGLE（後方互換）。
  // - SINGLE: serviceId に紐づく1サービスのみ叩ける
  // - ALL:    全 APPROVED サービスを叩ける（limitUsdc が予算上限）
  scope:      z.enum(["SINGLE", "ALL"]).optional().default("SINGLE"),
  limitUsdc:  z
    .string()
    .regex(/^\d+(\.\d+)?$/, "limitUsdc must be a positive decimal string")
    .refine((v) => parseFloat(v) > 0, "limitUsdc must be greater than 0"),
  buyerTag:   z.string().max(64).optional(),
  // 有効期限: ISO8601文字列。未指定なら30日後
  expiresAt:  z.string().datetime().optional(),
  // サンドボックス: 実USDCを動かさずモック課金（デフォルトfalse）
  sandbox:    z.boolean().optional().default(false),

  // ─── Incident contract v0 fields (all optional) ─────────────────────────
  workflowId:       z.string().max(128).optional(),
  agentId:          z.string().max(128).optional(),
  allowedUpstreams: z.array(z.string().max(256)).max(32).optional(),
  retryPolicy:      z.record(z.unknown()).optional(),
  replaySafe:       z.boolean().optional().default(false),
}).refine(
  (v) => v.scope === "ALL" || (v.serviceId && v.serviceId.length > 0),
  { message: "serviceId is required when scope=SINGLE", path: ["serviceId"] },
);

const TokenResponse = z.object({
  tokenId:   z.string(),
  jwt:       z.string(),
  buyerId:   z.string(),
  scope:     z.enum(["SINGLE", "ALL"]),
  serviceId: z.string().nullable(),  // ALL では null
  limitUsdc: z.string(),
  expiresAt: z.string(),
  sandbox:   z.boolean(),
  createdAt: z.string(),
});

const TokenListItem = z.object({
  id:        z.string(),
  scope:     z.enum(["SINGLE", "ALL"]),
  serviceId: z.string().nullable(),
  limitUsdc: z.string(),
  usedUsdc:  z.string(),
  buyerTag:  z.string().nullable(),
  expiresAt: z.string(),
  revoked:   z.boolean(),
  sandbox:   z.boolean(),
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
  const scope = body.scope; // refine() で SINGLE 時の serviceId 必須はバリデーション済み

  // ── バイヤーの存在・停止確認 ──────────────────────────────
  const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
  if (!buyer) throw new HTTPException(404, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });

  // ── サービスの存在・承認確認（SINGLE のみ） ─────────────────
  // ALL スコープでは特定サービスを縛らないので、proxy 側で都度
  // service.reviewStatus を確認する。
  if (scope === "SINGLE") {
    const service = await prisma.service.findUnique({ where: { id: body.serviceId! } });
    if (!service) throw new HTTPException(404, { message: "Service not found" });
    if (service.reviewStatus !== "APPROVED") {
      throw new HTTPException(403, { message: `Service is not approved (status: ${service.reviewStatus})` });
    }
  }

  // ── 残高確認（上限額がバイヤー残高を超えていないか）────────
  // サンドボックストークンは実USDCを動かさないため残高チェックをスキップ
  const limitDecimal = new Decimal(body.limitUsdc);
  if (!body.sandbox && buyer.balanceUsdc.lessThan(limitDecimal)) {
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

  // ── クライアント識別（SDK/プラグインからの User-Agent） ─────
  // X-LemonCake-Client を最優先、無ければ標準の User-Agent ヘッダを使う。
  // 生の文字列をそのまま保存（128文字で打ち切り）。
  const rawClient = c.req.header("X-LemonCake-Client") ?? c.req.header("User-Agent") ?? null;
  const clientUserAgent = rawClient ? rawClient.slice(0, 128) : null;

  // ── DBにTokenレコードを作成（IDをjtiとして使用）────────────
  const token = await prisma.token.create({
    data: {
      buyerId:   buyerId,
      scope,
      serviceId: scope === "SINGLE" ? body.serviceId! : null,
      limitUsdc: limitDecimal,
      buyerTag:  body.buyerTag ?? null,
      expiresAt,
      sandbox:   body.sandbox,
      clientUserAgent,
      // Incident contract v0 fields
      workflowId:       body.workflowId ?? null,
      agentId:          body.agentId ?? null,
      allowedUpstreams: body.allowedUpstreams ?? [],
      retryPolicy:      (body.retryPolicy as unknown as import("@prisma/client").Prisma.InputJsonValue | undefined) ?? undefined,
      replaySafe:       body.replaySafe,
    },
  });

  // ── JWTを署名・発行 ───────────────────────────────────────
  const jwt = await signPayToken({
    tokenId:   token.id,
    buyerId:   buyerId,
    scope,
    serviceId: scope === "SINGLE" ? body.serviceId : undefined,
    limitUsdc: limitDecimal.toFixed(18),
    buyerTag:  body.buyerTag,
    expiresAt,
  });

  return c.json(
    {
      tokenId:   token.id,
      jwt,
      buyerId:   token.buyerId,
      scope:     token.scope,
      serviceId: token.serviceId,
      limitUsdc: token.limitUsdc.toFixed(6),
      expiresAt: token.expiresAt.toISOString(),
      sandbox:   token.sandbox,
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

// ─── PATCH /api/tokens/:id/revoke ──────────────────────────

const revokeRoute = createRoute({
  method:  "patch",
  path:    "/{id}/revoke",
  tags:    ["Tokens"],
  summary: "Pay Token を無効化する（Kill Switch）",
  description:
    "指定した Pay Token を即座に revoke します。バイヤー自身の未失効トークンのみが対象で、" +
    "以降の課金／プロキシ呼び出しは 422 で拒否されます。冪等: 二度目は 409。",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ id: z.string(), revoked: z.literal(true) }),
        },
      },
      description: "無効化成功",
    },
    401: { description: "認証エラー" },
    403: { description: "他人のトークン / 停止中のバイヤー" },
    404: { description: "トークンが存在しない" },
    409: { description: "既に無効化済み" },
  },
});

tokensRouter.openapi(revokeRoute, async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
  try {
    buyerPayload = await verifyBuyerToken(auth.slice(7));
  } catch {
    throw new HTTPException(401, { message: "Invalid token" });
  }

  // 停止中のバイヤーは revoke を含む全ての書き込み操作を禁止
  // （読み出しだけは許容しているので整合性を揃える）
  const buyer = await prisma.buyer.findUnique({
    where:  { id: buyerPayload.buyerId },
    select: { suspended: true },
  });
  if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });

  const { id } = c.req.valid("param");

  // アトミックに revoke: 所有者一致 & 未失効の時だけ更新
  // → 同時リクエスト時の二重実行・第三者による他人のトークン停止を一発で防ぐ
  try {
    const updated = await prisma.token.update({
      where: { id, buyerId: buyerPayload.buyerId, revoked: false },
      data:  { revoked: true, revokedAt: new Date() },
    });
    return c.json({ id: updated.id, revoked: true as const }, 200);
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2025") {
      // 404/403/409 の区別のため個別に調べる
      const token = await prisma.token.findUnique({ where: { id } });
      if (!token) throw new HTTPException(404, { message: "Token not found" });
      if (token.buyerId !== buyerPayload.buyerId) throw new HTTPException(403, { message: "Forbidden" });
      if (token.revoked) throw new HTTPException(409, { message: "Already revoked" });
    }
    throw e;
  }
});

// ─── POST /api/tokens/revoke-bulk (Phase 4) ─────────────────
// ワークフローID or インシデントタグで一括 revoke する。
// 「うちのエージェントが prompt injection を食らった、workflow_id=X
//  または incident_tag=Y で発行された全トークンを即停止」を 1 call で。

const bulkRevokeRoute = createRoute({
  method:  "post",
  path:    "/revoke-bulk",
  tags:    ["Tokens"],
  summary: "ワークフロー / インシデントタグ単位で一括 revoke",
  description: [
    "`workflowId` または `incidentTag` のどちらか（または両方）を指定して、",
    "呼び出し元バイヤーが保有する未失効トークンを一括で revoke します。",
    "- `workflowId`: Token.workflowId に一致するトークン",
    "- `incidentTag`: 既存 Charge.incidentTag = タグ を持つ Token を逆引き",
    "冪等: 既に revoke 済みのものは結果に含まれない。",
  ].join("\n"),
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            workflowId:  z.string().max(128).optional(),
            incidentTag: z.string().max(128).optional(),
            reason:      z.string().max(500).optional(),
          }).refine(
            (v) => !!(v.workflowId || v.incidentTag),
            { message: "workflowId or incidentTag is required" },
          ),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            revokedCount: z.number(),
            tokenIds:     z.array(z.string()),
          }),
        },
      },
      description: "一括 revoke 成功",
    },
    400: { description: "バリデーションエラー" },
    401: { description: "認証エラー" },
    403: { description: "停止中のバイヤー" },
  },
});

tokensRouter.openapi(bulkRevokeRoute, async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
  try {
    buyerPayload = await verifyBuyerToken(auth.slice(7));
  } catch {
    throw new HTTPException(401, { message: "Invalid token" });
  }
  const buyerId = buyerPayload.buyerId;

  const buyer = await prisma.buyer.findUnique({
    where:  { id: buyerId },
    select: { suspended: true },
  });
  if (!buyer) throw new HTTPException(401, { message: "Buyer not found" });
  if (buyer.suspended) throw new HTTPException(403, { message: "Buyer is suspended" });

  const { workflowId, incidentTag, reason } = c.req.valid("json");

  // ── revoke 対象の token ID を収集 ─────────────────────────
  const targetIds = new Set<string>();

  if (workflowId) {
    const byWf = await prisma.token.findMany({
      where:  { buyerId, workflowId, revoked: false },
      select: { id: true },
    });
    for (const t of byWf) targetIds.add(t.id);
  }

  if (incidentTag) {
    const byTag = await prisma.charge.findMany({
      where:  { buyerId, incidentTag },
      select: { tokenId: true },
      distinct: ["tokenId"],
    });
    // 未失効のみに絞る
    const tokenIds = byTag.map((c) => c.tokenId);
    if (tokenIds.length > 0) {
      const alive = await prisma.token.findMany({
        where:  { id: { in: tokenIds }, buyerId, revoked: false },
        select: { id: true },
      });
      for (const t of alive) targetIds.add(t.id);
    }
  }

  if (targetIds.size === 0) {
    return c.json({ revokedCount: 0, tokenIds: [] }, 200);
  }

  // ── 一括 update（buyerId 二重ガード）───────────────────────
  const now = new Date();
  const result = await prisma.token.updateMany({
    where: {
      id:      { in: Array.from(targetIds) },
      buyerId,
      revoked: false,
    },
    data: {
      revoked:      true,
      revokedAt:    now,
      revokeReason: reason ?? (workflowId ? `bulk:workflow=${workflowId}` : `bulk:incident=${incidentTag}`),
    },
  });

  return c.json(
    { revokedCount: result.count, tokenIds: Array.from(targetIds) },
    200,
  );
});

// ─── GET /api/tokens ────────────────────────────────────────

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
      scope:     t.scope,
      serviceId: t.serviceId,
      limitUsdc: t.limitUsdc.toFixed(6),
      usedUsdc:  t.usedUsdc.toFixed(6),
      buyerTag:  t.buyerTag,
      expiresAt: t.expiresAt.toISOString(),
      revoked:   t.revoked,
      sandbox:   t.sandbox,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
  });
});
