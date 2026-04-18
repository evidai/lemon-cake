/**
 * GET  /api/buyers        — 購入者一覧
 * POST /api/buyers        — 購入者作成
 * GET  /api/buyers/:id    — 購入者詳細
 * PATCH /api/buyers/:id/deposit — USDC残高チャージ
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyAdminToken, verifyBuyerToken } from "../lib/jwt.js";

/** Admin JWT を検証するヘルパー */
async function requireAdmin(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return "Authorization header missing";
  const valid = await verifyAdminToken(authHeader.slice(7));
  return valid ? null : "Invalid or expired token";
}

export const buyersRouter = new OpenAPIHono();

// ─── Zodスキーマ ─────────────────────────────────────────────

const BuyerSchema = z
  .object({
    id:              z.string(),
    name:            z.string(),
    email:           z.string().email(),
    balanceUsdc:     z.string().describe("Decimal文字列 (例: '0.000000000000000000')"),
    kycTier:         z.enum(["NONE", "KYA", "KYC"]),
    dailyLimitUsdc:  z.string(),
    walletAddress:   z.string().nullable(),
    suspended:       z.boolean(),
    agentName:       z.string().nullable(),
    agentDescription:z.string().nullable(),
    kyaAppliedAt:    z.string().nullable(),
    createdAt:       z.string().datetime(),
    updatedAt:       z.string().datetime(),
  })
  .openapi("Buyer");

const CreateBuyerBody = z
  .object({
    name:           z.string().min(1).max(100).openapi({ example: "購入者A" }),
    email:          z.string().email().openapi({ example: "buyer@example.com" }),
    dailyLimitUsdc: z.number().positive().optional().default(10).openapi({ example: 10 }),
  })
  .openapi("CreateBuyerBody");

const DepositBody = z
  .object({
    amountUsdc: z
      .number()
      .positive()
      .openapi({ example: 100, description: "チャージ金額 (USDC)" }),
  })
  .openapi("DepositBody");

const ErrorSchema = z.object({ error: z.string() }).openapi("Error");

// ─── ヘルパー: Decimal → 文字列変換 ─────────────────────────

function serializeBuyer(b: {
  id: string; name: string; email: string;
  balanceUsdc: { toString(): string };
  kycTier: "NONE" | "KYA" | "KYC";
  dailyLimitUsdc: { toString(): string };
  walletAddress: string | null;
  suspended: boolean;
  agentName?: string | null;
  agentDescription?: string | null;
  kyaAppliedAt?: Date | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id:              b.id,
    name:            b.name,
    email:           b.email,
    balanceUsdc:     b.balanceUsdc.toString(),
    kycTier:         b.kycTier,
    dailyLimitUsdc:  b.dailyLimitUsdc.toString(),
    walletAddress:   b.walletAddress,
    suspended:       b.suspended,
    agentName:       b.agentName ?? null,
    agentDescription:b.agentDescription ?? null,
    kyaAppliedAt:    b.kyaAppliedAt?.toISOString() ?? null,
    createdAt:       b.createdAt.toISOString(),
    updatedAt:       b.updatedAt.toISOString(),
  };
}

// ─── GET /api/buyers ─────────────────────────────────────────

buyersRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    tags: ["Buyers"],
    summary: "購入者一覧取得",
    responses: {
      200: {
        content: { "application/json": { schema: z.array(BuyerSchema) } },
        description: "購入者一覧",
      },
    },
  }),
  async (c) => {
    const authErr = await requireAdmin(c.req.header("Authorization"));
    if (authErr) return c.json({ error: authErr }, 401) as any;

    const buyers = await prisma.buyer.findMany({
      orderBy: { createdAt: "desc" },
    });
    return c.json(buyers.map(serializeBuyer));
  },
);

// ─── POST /api/buyers ────────────────────────────────────────

buyersRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    tags: ["Buyers"],
    summary: "購入者作成",
    request: {
      body: {
        content: { "application/json": { schema: CreateBuyerBody } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: BuyerSchema } },
        description: "作成成功",
      },
      409: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "メールアドレス重複",
      },
    },
  }),
  async (c) => {
    const authErr = await requireAdmin(c.req.header("Authorization"));
    if (authErr) return c.json({ error: authErr }, 401) as any;

    const { name, email, dailyLimitUsdc } = c.req.valid("json");
    try {
      const buyer = await prisma.buyer.create({
        data: { name, email, dailyLimitUsdc },
      });
      return c.json(serializeBuyer(buyer), 201);
    } catch (e: unknown) {
      // Prisma unique constraint violation
      if (
        typeof e === "object" && e !== null &&
        "code" in e && (e as { code: string }).code === "P2002"
      ) {
        return c.json({ error: "このメールアドレスはすでに登録されています" }, 409);
      }
      throw e;
    }
  },
);

// ─── GET /api/buyers/:id ─────────────────────────────────────

buyersRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    tags: ["Buyers"],
    summary: "購入者詳細取得",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: BuyerSchema } },
        description: "購入者詳細",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Not Found",
      },
    },
  }),
  async (c) => {
    const authErr = await requireAdmin(c.req.header("Authorization"));
    if (authErr) return c.json({ error: authErr }, 401) as any;

    const { id } = c.req.valid("param");
    const buyer = await prisma.buyer.findUnique({ where: { id } });
    if (!buyer) return c.json({ error: "購入者が見つかりません" }, 404);
    return c.json(serializeBuyer(buyer));
  },
);

// ─── PATCH /api/buyers/:id/deposit ───────────────────────────

buyersRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}/deposit",
    tags: ["Buyers"],
    summary: "USDC残高チャージ",
    description: "指定した購入者のUSDC残高を加算します。",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { "application/json": { schema: DepositBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: BuyerSchema } },
        description: "チャージ成功",
      },
      400: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "アカウント停止中",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Not Found",
      },
    },
  }),
  async (c) => {
    const authErr = await requireAdmin(c.req.header("Authorization"));
    if (authErr) return c.json({ error: authErr }, 401) as any;

    const { id } = c.req.valid("param");
    const { amountUsdc } = c.req.valid("json");

    const buyer = await prisma.buyer.findUnique({ where: { id } });
    if (!buyer) return c.json({ error: "購入者が見つかりません" }, 404);
    if (buyer.suspended) return c.json({ error: "このアカウントは停止中です" }, 400);

    const updated = await prisma.buyer.update({
      where: { id },
      data: { balanceUsdc: { increment: amountUsdc } },
    });
    return c.json(serializeBuyer(updated));
  },
);

// ─── PATCH /api/buyers/:id/kyc ────────────────────────────────

const KycBody = z
  .object({
    kycTier: z.enum(["NONE", "KYA", "KYC"]).openapi({ example: "KYA" }),
  })
  .openapi("KycBody");

buyersRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}/kyc",
    tags: ["Buyers"],
    summary: "KYCティア変更（管理者）",
    description: "バイヤーのKYCティアを手動で変更します。NONE → KYA → KYC の順で昇格・降格が可能です。",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { "application/json": { schema: KycBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: BuyerSchema } },
        description: "変更成功",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Not Found",
      },
    },
  }),
  async (c) => {
    const authErr = await requireAdmin(c.req.header("Authorization"));
    if (authErr) return c.json({ error: authErr }, 401) as any;

    const { id } = c.req.valid("param");
    const { kycTier } = c.req.valid("json");

    const buyer = await prisma.buyer.findUnique({ where: { id } });
    if (!buyer) return c.json({ error: "購入者が見つかりません" }, 404);

    // ティアに応じて dailyLimitUsdc を自動設定
    const dailyLimits: Record<string, number> = { NONE: 10, KYA: 1000, KYC: 50000 };
    const updated = await prisma.buyer.update({
      where: { id },
      data:  { kycTier, dailyLimitUsdc: dailyLimits[kycTier] },
    });
    return c.json(serializeBuyer(updated));
  },
);

// ─── POST /api/buyers/kya ─────────────────────────────────────
// バイヤー自身がエージェント情報を登録し、KYAティアに昇格する（即時承認）

const KyaBody = z
  .object({
    agentName:        z.string().min(1).max(100).openapi({ example: "My Trading Agent" }),
    agentDescription: z.string().min(1).max(500).openapi({ example: "自社向け為替分析エージェント" }),
  })
  .openapi("KyaBody");

buyersRouter.openapi(
  createRoute({
    method:  "post",
    path:    "/kya",
    tags:    ["Buyers"],
    summary: "KYA 自己申請（エージェント情報登録）",
    description:
      "バイヤー自身が JWT 認証のうえ、エージェント名と用途を申告します。" +
      "成功すると kycTier が NONE → KYA に昇格し、1 日あたりの上限が 10 → 1,000 USDC に引き上げられます。" +
      "二重昇格はアトミックに防がれ、既に KYA/KYC の場合は 409 を返します。",
    request: {
      body: {
        content: { "application/json": { schema: KyaBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: BuyerSchema } },
        description: "KYA 昇格成功",
      },
      400: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "バリデーションエラー",
      },
      401: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "認証エラー",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Buyer 存在せず",
      },
      409: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "既に KYA/KYC ティア",
      },
    },
  }),
  async (c) => {
    // ── Buyer JWT 認証 ─────────────────────────────────────────
    const auth = c.req.header("Authorization");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401) as any;
    let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
    try {
      buyerPayload = await verifyBuyerToken(auth.slice(7));
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return c.json({ error: "Invalid token" }, 401) as any;
    }

    const { agentName, agentDescription } = c.req.valid("json");
    const buyerId = buyerPayload.buyerId;

    // ── アトミックな昇格: WHERE kycTier='NONE' を条件にすることで
    // 同時リクエストのレース条件（二重昇格）を防ぐ ───────────
    try {
      const updated = await prisma.buyer.update({
        where: { id: buyerId, kycTier: "NONE" },
        data: {
          kycTier:         "KYA",
          dailyLimitUsdc:  1000,
          agentName,
          agentDescription,
          kyaAppliedAt:    new Date(),
        },
      });
      return c.json(serializeBuyer(updated), 200);
    } catch (e: unknown) {
      // P2025: Record not found — 既に NONE 以外のティアにいる or Buyer が存在しない
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2025") {
        const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
        if (!buyer) return c.json({ error: "Buyer not found" }, 404);
        return c.json({ error: `Already at tier: ${buyer.kycTier}` }, 409);
      }
      throw e;
    }
  },
);
