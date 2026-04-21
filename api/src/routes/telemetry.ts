/**
 * GET /api/telemetry/client-usage  — SDK/プラグイン利用状況の集計（管理者）
 *
 * `Token.clientUserAgent` に保存した User-Agent を集計して、
 * どのクライアント（eliza-plugin-lemoncake/x.y.z, lemon-cake-mcp/... 等）が
 * 何件の Pay Token を発行しているか返す。
 *
 * 個人特定情報は含まず、匿名のクライアント識別文字列と件数のみ。
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "../lib/prisma.js";
import { verifyAdminToken } from "../lib/jwt.js";

export const telemetryRouter = new OpenAPIHono();

// ─── スキーマ定義 ──────────────────────────────────────────
const ClientBucketSchema = z.object({
  client:        z.string().describe("User-Agent 文字列（例: eliza-plugin-lemoncake/0.2.0 (node/23.x; darwin arm64)）"),
  family:        z.string().describe("クライアント種別のみ抽出した識別子（例: eliza-plugin-lemoncake）"),
  version:       z.string().nullable().describe("抽出したバージョン（例: 0.2.0）"),
  tokenCount:    z.number().int().describe("発行された Pay Token 数"),
  chargeCount:   z.number().int().describe("そのクライアント経由の課金件数"),
  totalUsdc:     z.string().describe("そのクライアント経由の課金総額（USDC）"),
  buyerCount:    z.number().int().describe("ユニークなバイヤー数"),
  firstSeen:     z.string().describe("初回トークン発行日時"),
  lastSeen:      z.string().describe("最新トークン発行日時"),
});

const UsageResponseSchema = z.object({
  windowDays:    z.number().describe("集計対象の日数"),
  generatedAt:   z.string(),
  totals: z.object({
    identifiedTokens:   z.number().int(),
    unidentifiedTokens: z.number().int().describe("User-Agent を持たない古い/直接呼び出しのトークン数"),
    totalClients:       z.number().int(),
  }),
  clients: z.array(ClientBucketSchema),
});

const ErrorSchema = z.object({ error: z.string() });

// ─── ルート ───────────────────────────────────────────────
const route = createRoute({
  method: "get",
  path:   "/client-usage",
  tags:   ["Telemetry"],
  summary: "SDK/プラグイン利用状況の集計",
  description:
    "`Token.clientUserAgent` を集計し、クライアント種別ごとに発行トークン数・課金件数・" +
    "ユニークバイヤー数を返す。管理者JWT が必要。",
  request: {
    query: z.object({
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  },
  responses: {
    200: { description: "OK",           content: { "application/json": { schema: UsageResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: ErrorSchema } } },
  },
});

// ─── UA 文字列から family / version を抽出 ──────────────────
function parseClient(ua: string): { family: string; version: string | null } {
  // `eliza-plugin-lemoncake/0.2.0 (node/23.x; darwin arm64)` のような形式を想定
  const m = ua.match(/^([^/\s]+)\/([^\s]+)/);
  if (m) return { family: m[1], version: m[2] };
  // 想定外の文字列は family=ua 全体 で 128 文字に丸める
  return { family: ua.slice(0, 40), version: null };
}

telemetryRouter.openapi(route, async (c) => {
  // ── 管理者 JWT 認証 ─────────────────────────────────────
  const auth = c.req.header("Authorization");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Invalid token" }, 401) as any;

  const { days } = c.req.valid("query");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // ── Token を全件取得（件数が膨大になったら groupBy に切替）──
  const tokens = await prisma.token.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id:              true,
      buyerId:         true,
      clientUserAgent: true,
      createdAt:       true,
    },
  });

  const identified = tokens.filter(t => t.clientUserAgent !== null);
  const unidentifiedCount = tokens.length - identified.length;

  // ── Charge を集計（Token.id → aggregates） ────────────────
  const tokenIds = identified.map(t => t.id);
  const chargeRows = tokenIds.length === 0 ? [] : await prisma.charge.findMany({
    where:  { tokenId: { in: tokenIds }, status: "COMPLETED" },
    select: { tokenId: true, amountUsdc: true },
  });
  const chargeByToken = new Map<string, { count: number; sumUsdc: number }>();
  for (const row of chargeRows) {
    const entry = chargeByToken.get(row.tokenId) ?? { count: 0, sumUsdc: 0 };
    entry.count += 1;
    entry.sumUsdc += Number(row.amountUsdc);
    chargeByToken.set(row.tokenId, entry);
  }

  // ── クライアント別バケット ────────────────────────────────
  type Bucket = {
    client:      string;
    family:      string;
    version:     string | null;
    tokenCount:  number;
    chargeCount: number;
    totalUsdc:   number;
    buyers:      Set<string>;
    firstSeen:   Date;
    lastSeen:    Date;
  };
  const buckets = new Map<string, Bucket>();

  for (const t of identified) {
    const ua = t.clientUserAgent!;
    const parsed = parseClient(ua);
    let b = buckets.get(ua);
    if (!b) {
      b = {
        client:      ua,
        family:      parsed.family,
        version:     parsed.version,
        tokenCount:  0,
        chargeCount: 0,
        totalUsdc:   0,
        buyers:      new Set(),
        firstSeen:   t.createdAt,
        lastSeen:    t.createdAt,
      };
      buckets.set(ua, b);
    }
    b.tokenCount += 1;
    b.buyers.add(t.buyerId);
    if (t.createdAt < b.firstSeen) b.firstSeen = t.createdAt;
    if (t.createdAt > b.lastSeen)  b.lastSeen  = t.createdAt;

    const agg = chargeByToken.get(t.id);
    if (agg) {
      b.chargeCount += agg.count;
      b.totalUsdc   += agg.sumUsdc;
    }
  }

  const clients = Array.from(buckets.values())
    .sort((a, b) => b.tokenCount - a.tokenCount)
    .map(b => ({
      client:       b.client,
      family:       b.family,
      version:      b.version,
      tokenCount:   b.tokenCount,
      chargeCount:  b.chargeCount,
      totalUsdc:    b.totalUsdc.toFixed(6),
      buyerCount:   b.buyers.size,
      firstSeen:    b.firstSeen.toISOString(),
      lastSeen:     b.lastSeen.toISOString(),
    }));

  return c.json({
    windowDays:  days,
    generatedAt: new Date().toISOString(),
    totals: {
      identifiedTokens:   identified.length,
      unidentifiedTokens: unidentifiedCount,
      totalClients:       clients.length,
    },
    clients,
  });
});
