/**
 * GET  /api/services           — サービス一覧
 * POST /api/services           — サービス登録
 * PATCH /api/services/:id/review — 審査ステータス変更（管理者）
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyAdminToken } from "../lib/jwt.js";
import { HTTPException } from "hono/http-exception";

/** Admin JWT を検証するヘルパー（未認証なら401を返す） */
async function requireAdmin(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return "Authorization header missing";
  const valid = await verifyAdminToken(authHeader.slice(7));
  return valid ? null : "Invalid or expired token";
}

export const servicesRouter = new OpenAPIHono();

// ─── Zodスキーマ ─────────────────────────────────────────────

const ServiceSchema = z.object({
  id:               z.string(),
  providerId:       z.string(),
  providerName:     z.string(),
  name:             z.string(),
  type:             z.enum(["API", "MCP"]),
  pricePerCallUsdc: z.string(),
  endpoint:         z.string().nullable(),
  reviewStatus:     z.enum(["PENDING", "APPROVED", "REJECTED"]),
  verified:         z.boolean(),
  createdAt:        z.string(),
  updatedAt:        z.string(),
}).openapi("Service");

const ErrorSchema = z.object({ error: z.string() }).openapi("Error");

function serializeService(s: {
  id: string; providerId: string;
  provider: { name: string };
  name: string; type: "API" | "MCP";
  pricePerCallUsdc: { toString(): string };
  endpoint: string | null;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  verified: boolean;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id:               s.id,
    providerId:       s.providerId,
    providerName:     s.provider.name,
    name:             s.name,
    type:             s.type,
    pricePerCallUsdc: s.pricePerCallUsdc.toString(),
    endpoint:         s.endpoint,
    reviewStatus:     s.reviewStatus,
    verified:         s.verified,
    createdAt:        s.createdAt.toISOString(),
    updatedAt:        s.updatedAt.toISOString(),
  };
}

// ─── GET /api/services ───────────────────────────────────────

servicesRouter.openapi(
  createRoute({
    method: "get",
    path:   "/",
    tags:   ["Services"],
    summary: "サービス一覧取得",
    request: {
      query: z.object({
        reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        providerId:   z.string().optional(),
        limit:        z.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ServiceSchema) } },
        description: "サービス一覧",
      },
    },
  }),
  async (c) => {
    const { reviewStatus, providerId, limit } = c.req.valid("query");
    const services = await prisma.service.findMany({
      where: {
        ...(reviewStatus ? { reviewStatus } : {}),
        ...(providerId   ? { providerId }   : {}),
      },
      include:  { provider: { select: { name: true } } },
      orderBy:  { createdAt: "desc" },
      take:     limit,
    });
    return c.json(services.map(serializeService));
  },
);

// ─── POST /api/services ──────────────────────────────────────

const CreateServiceBody = z.object({
  providerId:       z.string().min(1, "providerId is required"),
  name:             z.string().min(1).max(100).openapi({ example: "My AI API" }),
  type:             z.enum(["API", "MCP"]).default("API"),
  pricePerCallUsdc: z.string()
    .regex(/^\d+(\.\d+)?$/, "pricePerCallUsdc must be a positive decimal string")
    .openapi({ example: "0.001" }),
  endpoint:         z.string().url().optional().openapi({ example: "https://api.freee.co.jp/api/1" }),
  authHeader:       z.string().optional().openapi({ example: "Bearer sk_live_xxx" }),
}).openapi("CreateServiceBody");

servicesRouter.openapi(
  createRoute({
    method: "post",
    path:   "/",
    tags:   ["Services"],
    summary: "サービス登録",
    request: {
      body: {
        content: { "application/json": { schema: CreateServiceBody } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: ServiceSchema } },
        description: "登録成功（審査待ち状態）",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Provider not found",
      },
    },
  }),
  async (c) => {
    const authError = await requireAdmin(c.req.header("Authorization"));
    if (authError) return c.json({ error: authError }, 401) as any;

    const body = c.req.valid("json");
    const provider = await prisma.provider.findUnique({ where: { id: body.providerId } });
    if (!provider) throw new HTTPException(404, { message: "Provider not found" });

    const service = await prisma.service.create({
      data: {
        providerId:       body.providerId,
        name:             body.name,
        type:             body.type,
        pricePerCallUsdc: body.pricePerCallUsdc,
        ...(body.endpoint   ? { endpoint:   body.endpoint }   : {}),
        ...(body.authHeader ? { authHeader: body.authHeader } : {}),
      },
      include: { provider: { select: { name: true } } },
    });
    return c.json(serializeService(service), 201);
  },
);

// ─── PATCH /api/services/:id/review ─────────────────────────

const ReviewBody = z.object({
  reviewStatus: z.enum(["APPROVED", "REJECTED"]),
}).openapi("ReviewBody");

servicesRouter.openapi(
  createRoute({
    method: "patch",
    path:   "/{id}/review",
    tags:   ["Services"],
    summary: "サービス審査（管理者）",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: { "application/json": { schema: ReviewBody } },
        required: true,
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: ServiceSchema } },
        description: "審査完了",
      },
      404: {
        content: { "application/json": { schema: ErrorSchema } },
        description: "Service not found",
      },
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (c: any) => {
    const authError = await requireAdmin(c.req.header("Authorization"));
    if (authError) return c.json({ error: authError }, 401);

    const { id } = c.req.valid("param");
    const { reviewStatus } = c.req.valid("json");

    const exists = await prisma.service.findUnique({ where: { id } });
    if (!exists) throw new HTTPException(404, { message: "Service not found" });

    const updated = await prisma.service.update({
      where: { id },
      data:  { reviewStatus, verified: reviewStatus === "APPROVED" },
      include: { provider: { select: { name: true } } },
    });
    return c.json(serializeService(updated));
  },
);

// ─── GET /api/services/stats ─────────────────────────────────
// 認証不要・公開統計: サービスごとの累計課金回数・収益

const ServiceStatsItem = z.object({
  serviceId:    z.string(),
  serviceName:  z.string(),
  providerName: z.string(),
  chargeCount:  z.number(),
  totalUsdc:    z.string(),
  lastChargedAt: z.string().nullable(),
}).openapi("ServiceStatsItem");

servicesRouter.openapi(
  createRoute({
    method: "get",
    path:   "/stats",
    tags:   ["Services"],
    summary: "サービス別課金統計（公開）",
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ServiceStatsItem) } },
        description: "統計一覧",
      },
    },
  }),
  async (c) => {
    const [services, chargeGroups] = await prisma.$transaction([
      prisma.service.findMany({
        select: { id: true, name: true, provider: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.charge.groupBy as any)({
        by: ["serviceId"],
        _count:  { id: true },
        _sum:    { amountUsdc: true },
        _max:    { createdAt: true },
        where:   { status: "COMPLETED" },
      }),
    ]) as [typeof services, any[]];

    const statsMap = new Map(chargeGroups.map(g => [g.serviceId, g]));

    return c.json(services.map(s => {
      const g = statsMap.get(s.id);
      return {
        serviceId:     s.id,
        serviceName:   s.name,
        providerName:  s.provider.name,
        chargeCount:   g?._count.id ?? 0,
        totalUsdc:     (g?._sum.amountUsdc ?? 0).toString(),
        lastChargedAt: g?._max.createdAt?.toISOString() ?? null,
      };
    }));
  },
);
