/**
 * POST /api/jpyc/deposits       — JPYCチャージ申請（バイヤー）
 * GET  /api/jpyc/deposits       — 自分の申請一覧（バイヤー）
 * GET  /api/jpyc/deposits/all   — 全申請一覧（管理者）
 * PATCH /api/jpyc/deposits/:id/review — 審査（管理者）
 *
 * Phase 1 申請型フロー:
 *   1. バイヤーがプラットフォームウォレットへJPYCを送金
 *   2. TXハッシュとJPYC金額をPOSTで申請
 *   3. 管理者がPATCH /review で承認 → USDC残高に加算
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyBuyerToken, verifyAdminToken } from "../lib/jwt.js";
import { Decimal } from "@prisma/client/runtime/library";
import { verifyJpycTransfer, fetchJpycRate } from "../lib/jpyc-verify.js";

export const jpycRouter = new OpenAPIHono();

// レートリミット: JPYC入金申請は 10件/buyerId/1時間
const depositRateLimit = new Map<string, { count: number; resetAt: number }>();
function checkDepositRateLimit(buyerId: string): boolean {
  const now = Date.now();
  const entry = depositRateLimit.get(buyerId);
  if (!entry || now > entry.resetAt) {
    depositRateLimit.set(buyerId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── 設定 ────────────────────────────────────────────────────
// JPYC_RATE: 1 USDCに対するJPYC数（例: 150 → 150 JPYC = 1 USDC）
const JPYC_RATE = parseFloat(process.env.JPYC_RATE ?? "150");
// プラットフォームが受け取るJPYCウォレットアドレス（Polygon）
const PLATFORM_WALLET = process.env.JPYC_PLATFORM_WALLET ?? "0xPLATFORM_WALLET_ADDRESS";

// ─── Zodスキーマ ─────────────────────────────────────────────

const DepositRequestSchema = z.object({
  id:          z.string(),
  buyerId:     z.string(),
  txHash:      z.string(),
  amountJpyc:  z.string(),
  amountUsdc:  z.string().nullable(),
  status:      z.enum(["PENDING", "APPROVED", "REJECTED"]),
  reviewNote:  z.string().nullable(),
  reviewedAt:  z.string().nullable(),
  createdAt:   z.string(),
});

function serializeRequest(r: {
  id: string; buyerId: string; txHash: string;
  amountJpyc: { toString(): string };
  amountUsdc: { toString(): string } | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id:         r.id,
    buyerId:    r.buyerId,
    txHash:     r.txHash,
    amountJpyc: r.amountJpyc.toString(),
    amountUsdc: r.amountUsdc?.toString() ?? null,
    status:     r.status,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt:  r.createdAt.toISOString(),
  };
}

// ─── GET /api/jpyc/info — プラットフォームウォレット情報 ──────

jpycRouter.openapi(
  createRoute({
    method:  "get",
    path:    "/info",
    tags:    ["JPYC"],
    summary: "JPYCチャージ情報を取得",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              platformWallet: z.string(),
              jpycRate:       z.number(),
              network:        z.string(),
            }),
          },
        },
        description: "チャージ先ウォレット情報",
      },
    },
  }),
  async (c) => {
    const liveRate = await fetchJpycRate();
    return c.json({
      platformWallet: PLATFORM_WALLET,
      jpycRate:       liveRate,
      network:        "Polygon",
    });
  },
);

// ─── POST /api/jpyc/deposits — チャージ申請 ─────────────────

const SubmitDepositBody = z.object({
  txHash:     z.string().min(10, "txHash is required"),
  amountJpyc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "amountJpyc: 正の数値を入力してください")
    .refine((v) => parseFloat(v) > 0, "amountJpyc must be greater than 0"),
});

jpycRouter.openapi(
  createRoute({
    method:  "post",
    path:    "/deposits",
    tags:    ["JPYC"],
    summary: "JPYCチャージを申請する",
    description: [
      `プラットフォームウォレット (${PLATFORM_WALLET}) へJPYCを送金後、TXハッシュを申請します。`,
      "",
      `現在の換算レート: ${JPYC_RATE} JPYC = 1 USDC`,
    ].join("\n"),
    request: {
      body: {
        content: { "application/json": { schema: SubmitDepositBody } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: DepositRequestSchema } },
        description: "申請受付",
      },
      401: { description: "認証エラー" },
      409: { description: "TXハッシュ重複" },
    },
  }),
  async (c) => {
    // バイヤー認証
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401) as any;
    }
    let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
    try {
      buyerPayload = await verifyBuyerToken(auth.slice(7));
    } catch {
      return c.json({ error: "Invalid token" }, 401) as any;
    }

    // レートリミットチェック
    if (!checkDepositRateLimit(buyerPayload.buyerId)) {
      return c.json({ error: "申請が多すぎます。1時間後に再試行してください。" }, 429) as any;
    }

    const { txHash, amountJpyc } = c.req.valid("json");
    const amountJpycDecimal = new Decimal(amountJpyc);

    // TXハッシュ重複チェック
    const existing = await prisma.jpycDepositRequest.findUnique({ where: { txHash } });
    if (existing) {
      return c.json({ error: "このTXハッシュはすでに申請されています" }, 409) as any;
    }

    // ── オンチェーン自動検証 ──────────────────────────────────
    const verify = await verifyJpycTransfer(txHash, PLATFORM_WALLET, amountJpyc);

    if (!verify.valid) {
      // 検証失敗 → REJECTED で記録して返す
      const rejected = await prisma.jpycDepositRequest.create({
        data: {
          buyerId:    buyerPayload.buyerId,
          txHash,
          amountJpyc: amountJpycDecimal,
          status:     "REJECTED",
          reviewNote: verify.error ?? "オンチェーン検証失敗",
          reviewedAt: new Date(),
        },
      });
      return c.json({ error: verify.error ?? "オンチェーン検証に失敗しました" }, 400) as any;
    }

    // ── 検証OK → 自動承認・USDC付与 ──────────────────────────
    const liveRate  = await fetchJpycRate();
    const actualJpyc = new Decimal(verify.actualJpyc);
    const usdcAmount = actualJpyc.div(liveRate).toDecimalPlaces(6);

    const req = await prisma.$transaction(async (tx) => {
      const deposit = await tx.jpycDepositRequest.create({
        data: {
          buyerId:    buyerPayload.buyerId,
          txHash,
          amountJpyc: actualJpyc,
          amountUsdc: usdcAmount,
          status:     "APPROVED",
          reviewNote: `自動承認 (レート: ${liveRate} JPYC/USDC)`,
          reviewedAt: new Date(),
        },
      });
      await tx.buyer.update({
        where: { id: buyerPayload.buyerId },
        data:  { balanceUsdc: { increment: usdcAmount } },
      });
      return deposit;
    });

    return c.json(serializeRequest(req), 201);
  },
);

// ─── GET /api/jpyc/deposits — 自分の申請一覧 ────────────────

jpycRouter.openapi(
  createRoute({
    method:  "get",
    path:    "/deposits",
    tags:    ["JPYC"],
    summary: "自分のJPYCチャージ申請一覧",
    request: {
      query: z.object({
        page:  z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              data:  z.array(DepositRequestSchema),
              total: z.number(),
              page:  z.number(),
            }),
          },
        },
        description: "申請一覧",
      },
    },
  }),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401) as any;
    }
    let buyerPayload: Awaited<ReturnType<typeof verifyBuyerToken>>;
    try {
      buyerPayload = await verifyBuyerToken(auth.slice(7));
    } catch {
      return c.json({ error: "Invalid token" }, 401) as any;
    }

    const { page, limit } = c.req.valid("query");
    const skip = (page - 1) * limit;
    const buyerId = buyerPayload.buyerId;

    const [requests, total] = await prisma.$transaction([
      prisma.jpycDepositRequest.findMany({
        where:   { buyerId },
        orderBy: { createdAt: "desc" },
        skip,
        take:    limit,
      }),
      prisma.jpycDepositRequest.count({ where: { buyerId } }),
    ]);

    return c.json({ data: requests.map(serializeRequest), total, page });
  },
);

// ─── GET /api/jpyc/deposits/all — 管理者: 全申請一覧 ─────────

jpycRouter.openapi(
  createRoute({
    method:  "get",
    path:    "/deposits/all",
    tags:    ["JPYC"],
    summary: "全JPYCチャージ申請一覧（管理者）",
    request: {
      query: z.object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              data:  z.array(DepositRequestSchema),
              total: z.number(),
              page:  z.number(),
            }),
          },
        },
        description: "申請一覧",
      },
    },
  }),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401) as any;
    if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Invalid token" }, 401) as any;

    const { status, page, limit } = c.req.valid("query");
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [requests, total] = await prisma.$transaction([
      prisma.jpycDepositRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take:    limit,
        include: { buyer: { select: { name: true, email: true } } },
      }),
      prisma.jpycDepositRequest.count({ where }),
    ]);

    return c.json({
      data: requests.map((r) => ({
        ...serializeRequest(r),
        buyerName:  (r as typeof r & { buyer: { name: string } }).buyer.name,
        buyerEmail: (r as typeof r & { buyer: { email: string } }).buyer.email,
      })),
      total,
      page,
    });
  },
);

// ─── PATCH /api/jpyc/deposits/:id/review — 管理者: 審査 ──────

const ReviewBody = z.object({
  status:     z.enum(["APPROVED", "REJECTED"]),
  amountUsdc: z.string()
    .regex(/^\d+(\.\d{1,6})?$/, "amountUsdc: 正の数値を入力してください")
    .optional(),
  reviewNote: z.string().max(500).optional(),
});

jpycRouter.openapi(
  createRoute({
    method:  "patch",
    path:    "/deposits/:id/review",
    tags:    ["JPYC"],
    summary: "JPYCチャージ申請を審査する（管理者）",
    description: [
      "**APPROVED** の場合: amountUsdc を指定するか、未指定なら amountJpyc / jpycRate で自動計算します。",
      "承認と同時にバイヤーのUSDC残高を加算します。",
    ].join("\n"),
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { "application/json": { schema: ReviewBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: DepositRequestSchema } },
        description: "審査完了",
      },
      404: { description: "申請が見つからない" },
      409: { description: "既に審査済み" },
    },
  }),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401) as any;
    if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Invalid token" }, 401) as any;

    const { id } = c.req.valid("param");
    const { status, amountUsdc, reviewNote } = c.req.valid("json");

    const request = await prisma.jpycDepositRequest.findUnique({ where: { id } });
    if (!request) return c.json({ error: "申請が見つかりません" }, 404) as any;
    if (request.status !== "PENDING") {
      return c.json({ error: `既に${request.status === "APPROVED" ? "承認" : "却下"}済みです` }, 409) as any;
    }

    // USDC金額を決定（明示指定 or 自動換算）
    const usdcAmount = status === "APPROVED"
      ? new Decimal(amountUsdc ?? request.amountJpyc.div(JPYC_RATE).toFixed(6))
      : null;

    if (status === "APPROVED" && usdcAmount) {
      // トランザクション: 申請更新 + 残高加算
      const updated = await prisma.$transaction(async (tx) => {
        const updated = await tx.jpycDepositRequest.update({
          where: { id },
          data: {
            status,
            amountUsdc: usdcAmount,
            reviewNote: reviewNote ?? null,
            reviewedAt: new Date(),
          },
        });
        await tx.buyer.update({
          where: { id: request.buyerId },
          data: { balanceUsdc: { increment: usdcAmount } },
        });
        return updated;
      });
      return c.json(serializeRequest(updated));
    } else {
      // 却下
      const updated = await prisma.jpycDepositRequest.update({
        where: { id },
        data: {
          status,
          reviewNote: reviewNote ?? null,
          reviewedAt: new Date(),
        },
      });
      return c.json(serializeRequest(updated));
    }
  },
);
