/**
 * GET  /api/providers     — プロバイダー一覧
 * POST /api/providers     — プロバイダー登録
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyAdminToken } from "../lib/jwt.js";

export const providersRouter = new OpenAPIHono();

// ─── Zodスキーマ ─────────────────────────────────────────────

const ProviderSchema = z.object({
  id:            z.string(),
  name:          z.string(),
  email:         z.string(),
  walletAddress: z.string(),
  createdAt:     z.string(),
  updatedAt:     z.string(),
}).openapi("Provider");

const CreateProviderBody = z.object({
  name:          z.string().min(1).max(100).openapi({ example: "My Company" }),
  email:         z.string().email().openapi({ example: "contact@example.com" }),
  walletAddress: z.string().min(1).openapi({ example: "0xAbCd1234..." }),
}).openapi("CreateProviderBody");

function serializeProvider(p: {
  id: string; name: string; email: string; walletAddress: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id:            p.id,
    name:          p.name,
    email:         p.email,
    walletAddress: p.walletAddress,
    createdAt:     p.createdAt.toISOString(),
    updatedAt:     p.updatedAt.toISOString(),
  };
}

// ─── GET /api/providers ──────────────────────────────────────

providersRouter.openapi(
  createRoute({
    method: "get",
    path:   "/",
    tags:   ["Providers"],
    summary: "プロバイダー一覧取得",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      200: {
        content: { "application/json": { schema: z.array(ProviderSchema) } },
        description: "プロバイダー一覧",
      },
    },
  }),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Invalid token" }, 401);

    const { limit } = c.req.valid("query");
    const providers = await prisma.provider.findMany({
      orderBy: { createdAt: "desc" },
      take:    limit,
    });
    return c.json(providers.map(serializeProvider));
  },
);

// ─── POST /api/providers ─────────────────────────────────────

providersRouter.openapi(
  createRoute({
    method: "post",
    path:   "/",
    tags:   ["Providers"],
    summary: "プロバイダー登録",
    request: {
      body: {
        content: { "application/json": { schema: CreateProviderBody } },
        required: true,
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: ProviderSchema } },
        description: "登録成功",
      },
    },
  }),
  async (c) => {
    const auth = c.req.header("Authorization");
    if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
    if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Invalid token" }, 401);

    const body = c.req.valid("json");
    const provider = await prisma.provider.create({
      data: { name: body.name, email: body.email, walletAddress: body.walletAddress },
    });
    return c.json(serializeProvider(provider), 201);
  },
);
