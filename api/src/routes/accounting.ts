/**
 * /api/accounting — Per-Buyer Accounting Integration Routes
 *
 * Buyers connect their own accounting software via OAuth.
 * Supported: QuickBooks, Xero, Zoho, Sage, NetSuite, freee, Money Forward
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";
import { getXeroTenantId, getZohoOrgId, encryptToken, validateNetSuiteAccountId } from "../lib/accounting.js";

export const accountingRouter = new Hono();

// ─── Helper: get buyerId from context ────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBuyerId(c: any): string {
  const id = (c as never as { get: (k: string) => string }).get("buyerId") as string | undefined;
  if (!id) throw new HTTPException(401, { message: "Unauthorized" });
  return id;
}

// ─── DASHBOARD_URL validation ─────────────────────────────────────────────────
const DASHBOARD_URL = (() => {
  const url = process.env.DASHBOARD_URL ?? "https://lemoncake.xyz";
  if (!url.startsWith("https://")) {
    throw new Error("DASHBOARD_URL must start with https://");
  }
  return url;
})();

// ─── OAuth provider configs ───────────────────────────────────────────────────
const OAUTH_CONFIGS = {
  quickbooks: {
    authUrl:         "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl:        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope:           "com.intuit.quickbooks.accounting",
    clientIdEnv:     "QB_CLIENT_ID",
    clientSecretEnv: "QB_CLIENT_SECRET",
  },
  xero: {
    authUrl:         "https://login.xero.com/identity/connect/authorize",
    tokenUrl:        "https://identity.xero.com/connect/token",
    scope:           "accounting.transactions accounting.contacts accounting.settings offline_access",
    clientIdEnv:     "XERO_CLIENT_ID",
    clientSecretEnv: "XERO_CLIENT_SECRET",
  },
  zoho: {
    authUrl:         `https://accounts.zoho.${process.env.ZOHO_REGION ?? "com"}/oauth/v2/auth`,
    tokenUrl:        `https://accounts.zoho.${process.env.ZOHO_REGION ?? "com"}/oauth/v2/token`,
    scope:           "ZohoBooks.fullaccess.all",
    clientIdEnv:     "ZOHO_CLIENT_ID",
    clientSecretEnv: "ZOHO_CLIENT_SECRET",
  },
  sage: {
    authUrl:         "https://www.sageone.com/oauth2/auth/central?filter=apiv3.1",
    tokenUrl:        "https://oauth.accounting.sage.com/token",
    scope:           "full_access",
    clientIdEnv:     "SAGE_CLIENT_ID",
    clientSecretEnv: "SAGE_CLIENT_SECRET",
  },
  freee: {
    authUrl:         "https://accounts.secure.freee.co.jp/public_api/authorize",
    tokenUrl:        "https://accounts.secure.freee.co.jp/public_api/token",
    scope:           "read write",
    clientIdEnv:     "FREEE_CLIENT_ID",
    clientSecretEnv: "FREEE_CLIENT_SECRET",
  },
  moneyforward: {
    authUrl:         "https://api.biz.moneyforward.com/authorize",
    tokenUrl:        "https://api.biz.moneyforward.com/token",
    scope:           "mfc/invoice/data.write mfc/invoice/data.read office.read",
    clientIdEnv:     "MF_CLIENT_ID",
    clientSecretEnv: "MF_CLIENT_SECRET",
  },
} as const;

type OAuthProvider = keyof typeof OAUTH_CONFIGS;

const CALLBACK_BASE_URL =
  process.env.CALLBACK_BASE_URL ?? "https://skillful-blessing-production.up.railway.app";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set");
  return new TextEncoder().encode(secret);
}

// ─── Rate limiter for /oauth/start/:provider ────────────────────────────────
// Max 5 requests per buyerId per 15 minutes
const oauthStartRateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX      = 5;
const RATE_LIMIT_WINDOW   = 15 * 60 * 1000; // 15 minutes in ms

function checkOAuthStartRateLimit(buyerId: string): void {
  const now    = Date.now();
  const entry  = oauthStartRateLimit.get(buyerId);

  if (!entry || now >= entry.resetAt) {
    oauthStartRateLimit.set(buyerId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    throw new HTTPException(429, { message: "Too many OAuth requests. Please try again later." });
  }

  entry.count += 1;
}

// ─── NetSuite zod schema ──────────────────────────────────────────────────────
const netsuiteSchema = z.object({
  nsAccountId:       z.string().min(4).regex(/^[A-Za-z0-9_-]{4,50}$/, {
    message: "nsAccountId must be 4–50 alphanumeric/dash/underscore characters",
  }),
  nsConsumerKey:    z.string().min(32, { message: "nsConsumerKey must be at least 32 characters" }),
  nsConsumerSecret: z.string().min(32, { message: "nsConsumerSecret must be at least 32 characters" }),
  nsTokenId:        z.string().min(32, { message: "nsTokenId must be at least 32 characters" }),
  nsTokenSecret:    z.string().min(32, { message: "nsTokenSecret must be at least 32 characters" }),
  expenseAccountRef: z.string().optional(),
  cashAccountRef:    z.string().optional(),
});

// ─── GET /connections — list buyer's accounting connections ──────────────────
accountingRouter.get("/connections", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);

  const connections = await prisma.buyerAccountingConnection.findMany({
    where: { buyerId },
    select: {
      id:               true,
      provider:         true,
      externalId:       true,
      externalName:     true,
      expenseAccountRef: true,
      cashAccountRef:   true,
      active:           true,
      createdAt:        true,
      updatedAt:        true,
      // Never return tokens
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({ connections });
});

// ─── DELETE /connections/:id — disconnect ─────────────────────────────────────
accountingRouter.delete("/connections/:id", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);
  const id      = c.req.param("id");

  // Ownership check: use findFirst with buyerId to prevent IDOR
  const conn = await prisma.buyerAccountingConnection.findFirst({ where: { id, buyerId } });
  if (!conn) {
    throw new HTTPException(404, { message: "Connection not found" });
  }

  await prisma.buyerAccountingConnection.delete({ where: { id } });
  return c.json({ ok: true });
});

// ─── PATCH /connections/:id — update account refs ────────────────────────────
accountingRouter.patch("/connections/:id", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);
  const id      = c.req.param("id");

  // Ownership check: use findFirst with buyerId to prevent IDOR
  const conn = await prisma.buyerAccountingConnection.findFirst({ where: { id, buyerId } });
  if (!conn) {
    throw new HTTPException(404, { message: "Connection not found" });
  }

  const body = await c.req.json() as {
    expenseAccountRef?: string;
    cashAccountRef?:    string;
    active?:            boolean;
  };

  const updated = await prisma.buyerAccountingConnection.update({
    where: { id },
    data:  {
      ...(body.expenseAccountRef !== undefined ? { expenseAccountRef: body.expenseAccountRef } : {}),
      ...(body.cashAccountRef    !== undefined ? { cashAccountRef:    body.cashAccountRef }    : {}),
      ...(body.active            !== undefined ? { active:            body.active }            : {}),
    },
    select: {
      id:               true,
      provider:         true,
      externalId:       true,
      externalName:     true,
      expenseAccountRef: true,
      cashAccountRef:   true,
      active:           true,
      updatedAt:        true,
    },
  });

  return c.json({ connection: updated });
});

// ─── POST /netsuite — save NetSuite TBA credentials ──────────────────────────
accountingRouter.post("/netsuite", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);

  let body: z.infer<typeof netsuiteSchema>;
  try {
    const raw = await c.req.json();
    body = netsuiteSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new HTTPException(400, { message: err.errors.map(e => e.message).join("; ") });
    }
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  // Extra SSRF check (belt-and-suspenders)
  validateNetSuiteAccountId(body.nsAccountId);

  const connection = await prisma.buyerAccountingConnection.upsert({
    where:  { buyerId_provider: { buyerId, provider: "NETSUITE" } },
    create: {
      buyerId,
      provider:         "NETSUITE",
      accessToken:      "",  // NetSuite TBA has no access token
      nsAccountId:      body.nsAccountId,
      nsConsumerKey:    encryptToken(body.nsConsumerKey),
      nsConsumerSecret: encryptToken(body.nsConsumerSecret),
      nsTokenId:        encryptToken(body.nsTokenId),
      nsTokenSecret:    encryptToken(body.nsTokenSecret),
      expenseAccountRef: body.expenseAccountRef,
      cashAccountRef:   body.cashAccountRef,
    },
    update: {
      nsAccountId:      body.nsAccountId,
      nsConsumerKey:    encryptToken(body.nsConsumerKey),
      nsConsumerSecret: encryptToken(body.nsConsumerSecret),
      nsTokenId:        encryptToken(body.nsTokenId),
      nsTokenSecret:    encryptToken(body.nsTokenSecret),
      ...(body.expenseAccountRef !== undefined ? { expenseAccountRef: body.expenseAccountRef } : {}),
      ...(body.cashAccountRef    !== undefined ? { cashAccountRef:    body.cashAccountRef }    : {}),
      active: true,
    },
    select: { id: true, provider: true, active: true, createdAt: true },
  });

  return c.json({ connection }, 201);
});

// ─── GET /oauth/start/:provider — return OAuth URL ───────────────────────────
accountingRouter.get("/oauth/start/:provider", requireBuyerAuth, async (c) => {
  const buyerId      = getBuyerId(c);
  const providerParam = c.req.param("provider").toLowerCase() as OAuthProvider;

  const config = OAUTH_CONFIGS[providerParam];
  if (!config) {
    throw new HTTPException(400, { message: `Unknown accounting provider: ${providerParam}` });
  }

  // Guard: check provider env vars are configured before starting OAuth
  const clientId     = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return c.json({ error: "このプロバイダーは現在設定されていません" }, 503);
  }

  // Rate limit: max 5 OAuth start requests per buyer per 15 minutes
  checkOAuthStartRateLimit(buyerId);

  // Sign a short-lived state JWT (10 min max) containing buyerId + provider + nonce
  const state = await new SignJWT({ buyerId, provider: providerParam, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecret());

  const redirectUri = `${CALLBACK_BASE_URL}/api/accounting/oauth/callback/${providerParam}`;

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: "code",
    scope:         config.scope,
    redirect_uri:  redirectUri,
    state,
  });

  const url = `${config.authUrl}?${params.toString()}`;

  return c.json({ url });
});

// ─── GET /oauth/callback/:provider — handle OAuth callback ───────────────────
accountingRouter.get("/oauth/callback/:provider", async (c) => {
  const providerParam = c.req.param("provider").toLowerCase() as OAuthProvider;
  const config = OAUTH_CONFIGS[providerParam];
  if (!config) {
    // Redirect only to hardcoded DASHBOARD_URL — never to user-supplied URL
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=unknown_provider`);
  }

  const { code, state, error, realmId } = c.req.query() as {
    code?:    string;
    state?:   string;
    error?:   string;
    realmId?: string;
  };

  // Reject if state is missing — required for CSRF protection
  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  if (error || !code) {
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=${encodeURIComponent(error ?? "missing_code")}`);
  }

  // Verify state JWT (CSRF protection)
  let statePayload: { buyerId: string; provider: string; nonce: string };
  try {
    const { payload } = await jwtVerify(state, getJwtSecret());
    statePayload = payload as typeof statePayload;
  } catch {
    return c.json({ error: "Invalid or expired state parameter" }, 400);
  }

  // Confirm provider in state matches URL param
  if (statePayload.provider !== providerParam) {
    return c.json({ error: "State provider mismatch" }, 400);
  }

  const { buyerId } = statePayload;

  const clientId     = process.env[config.clientIdEnv]     ?? "";
  const clientSecret = process.env[config.clientSecretEnv] ?? "";

  const redirectUri = `${CALLBACK_BASE_URL}/api/accounting/oauth/callback/${providerParam}`;

  // Exchange code for tokens
  let accessToken:  string;
  let refreshToken: string | undefined;

  try {
    // Xero と Money Forward は CLIENT_SECRET_BASIC 必須
    // （id/secret を Authorization ヘッダーに）。他は client_secret_post で OK。
    const useBasicAuth = providerParam === "xero" || providerParam === "moneyforward";

    const tokenHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const tokenBody: Record<string, string> = {
      grant_type:   "authorization_code",
      code,
      redirect_uri: redirectUri,
    };

    if (useBasicAuth) {
      tokenHeaders["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else {
      tokenBody["client_id"]     = clientId;
      tokenBody["client_secret"] = clientSecret;
    }

    const tokenRes = await fetch(config.tokenUrl, {
      method:  "POST",
      headers: tokenHeaders,
      body:    new URLSearchParams(tokenBody).toString(),
    });

    if (!tokenRes.ok) {
      // Do NOT log or include token exchange response body — may contain credentials
      console.error(`[Accounting] Token exchange failed for ${providerParam}: HTTP ${tokenRes.status}`);
      return c.redirect(`${DASHBOARD_URL}/?accounting_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string; refresh_token?: string;
    };
    accessToken  = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
  } catch (err) {
    console.error(`[Accounting] Token exchange error for ${providerParam}:`, err instanceof Error ? err.message : "unknown");
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=token_exchange_error`);
  }

  // Resolve provider-specific external IDs
  let externalId:   string | undefined;
  let externalName: string | undefined;

  try {
    if (providerParam === "quickbooks" && realmId) {
      externalId = realmId;
    } else if (providerParam === "xero") {
      externalId = await getXeroTenantId(accessToken);
    } else if (providerParam === "zoho") {
      const region = process.env.ZOHO_REGION ?? "com";
      externalId = await getZohoOrgId(accessToken, region);
    }
  } catch (err) {
    console.error(`[Accounting] Failed to get externalId for ${providerParam}:`, err instanceof Error ? err.message : "unknown");
    // Non-fatal: continue saving connection without externalId
  }

  // Map provider param to Prisma enum
  const providerEnum = providerParam.toUpperCase() as
    "QUICKBOOKS" | "XERO" | "ZOHO" | "SAGE" | "FREEE" | "MONEYFORWARD";

  // Upsert connection — encrypt tokens before storing
  try {
    await prisma.buyerAccountingConnection.upsert({
      where:  { buyerId_provider: { buyerId, provider: providerEnum } },
      create: {
        buyerId,
        provider:     providerEnum,
        accessToken:  encryptToken(accessToken),
        refreshToken: refreshToken ? encryptToken(refreshToken) : undefined,
        externalId,
        externalName,
        active: true,
      },
      update: {
        accessToken:  encryptToken(accessToken),
        refreshToken: refreshToken ? encryptToken(refreshToken) : undefined,
        externalId,
        externalName,
        active: true,
      },
    });
  } catch (err) {
    console.error(`[Accounting] DB upsert failed for ${providerParam}:`, err instanceof Error ? err.message : "unknown");
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=db_error`);
  }

  // Redirect only to hardcoded DASHBOARD_URL — never to any user-supplied URL
  // page=accounting でダッシュボードの会計連携タブを開いた状態で着地させる
  return c.redirect(`${DASHBOARD_URL}/?page=accounting&accounting_connected=true&provider=${providerParam}`);
});

// ═══════════════════════════════════════════════════════════════
// M2M決済 自動会計ロールアップ API
// ═══════════════════════════════════════════════════════════════

import { buildRollup, syncRollup, runDailyRollup } from "../lib/accounting-rollup.js";

// ─── POST /api/accounting/rollup — 手動ロールアップ作成 ───────
// body: { periodStart, periodEnd, granularity?, autoSync? }
accountingRouter.post("/rollup", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);

  let body: { periodStart?: string; periodEnd?: string; granularity?: string; autoSync?: boolean };
  try { body = await c.req.json(); } catch { body = {}; }

  // デフォルト: 昨日1日分
  const now         = new Date();
  const yesterday   = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const periodStart = body.periodStart
    ? new Date(body.periodStart)
    : new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
  const periodEnd = body.periodEnd
    ? new Date(body.periodEnd)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
    return c.json({ error: "Invalid date format. Use ISO8601." }, 400);
  }
  if (periodStart >= periodEnd) {
    return c.json({ error: "periodStart must be before periodEnd" }, 400);
  }
  // 最大31日間に制限
  const diffDays = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 31) {
    return c.json({ error: "Period cannot exceed 31 days. Use MONTHLY granularity for longer periods." }, 400);
  }

  const granularity = (body.granularity === "MONTHLY" ? "MONTHLY" : "DAILY") as "DAILY" | "MONTHLY";

  const built = await buildRollup(buyerId, periodStart, periodEnd, granularity);
  if (!built) {
    return c.json({ message: "No completed charges found in this period.", rollup: null }, 200);
  }

  let syncResult = null;
  if (body.autoSync !== false) {
    syncResult = await syncRollup(built.rollupId);
  }

  const rollup = await prisma.chargeRollup.findUnique({ where: { id: built.rollupId } });

  return c.json({
    rollup: serializeRollup(rollup!),
    sync:   syncResult,
  }, 201);
});

// ─── GET /api/accounting/rollup — ロールアップ一覧 ───────────
accountingRouter.get("/rollup", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);
  const page  = Math.max(1, parseInt(c.req.query("page")  ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query("limit") ?? "20")));
  const skip  = (page - 1) * limit;

  const [rollups, total] = await Promise.all([
    prisma.chargeRollup.findMany({
      where:   { buyerId },
      orderBy: { periodStart: "desc" },
      skip,
      take:    limit,
    }),
    prisma.chargeRollup.count({ where: { buyerId } }),
  ]);

  return c.json({ data: rollups.map(serializeRollup), total, page });
});

// ─── POST /api/accounting/rollup/:id/sync — 再同期 ───────────
accountingRouter.post("/rollup/:id/sync", requireBuyerAuth, async (c) => {
  const buyerId   = getBuyerId(c);
  const rollupId  = c.req.param("id");

  const rollup = await prisma.chargeRollup.findUnique({ where: { id: rollupId } });
  if (!rollup || rollup.buyerId !== buyerId) {
    return c.json({ error: "Rollup not found" }, 404);
  }

  // 再同期: syncedAt をリセット
  await prisma.chargeRollup.update({
    where: { id: rollupId },
    data:  { syncedAt: null, syncError: null, externalDealId: null },
  });

  const result = await syncRollup(rollupId);
  const updated = await prisma.chargeRollup.findUnique({ where: { id: rollupId } });

  return c.json({ rollup: serializeRollup(updated!), sync: result });
});

// ─── POST /api/accounting/rollup/run-daily — 管理者: 日次バッチ実行 ─
accountingRouter.post("/rollup/run-daily", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { verifyAdminToken } = await import("../lib/jwt.js");
    if (!(await verifyAdminToken(auth.slice(7)))) return c.json({ error: "Forbidden" }, 403);
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  const result = await runDailyRollup();
  return c.json(result);
});

// ─── シリアライザ ────────────────────────────────────────────
function serializeRollup(r: {
  id: string; buyerId: string; periodStart: Date; periodEnd: Date;
  granularity: string; chargeCount: number; totalUsdc: { toString(): string };
  totalJpy: number; jpyRate: { toString(): string };
  accountingProvider: string | null; externalDealId: string | null;
  syncedAt: Date | null; syncError: string | null;
  serviceBreakdown: unknown; createdAt: Date;
}) {
  return {
    id:                r.id,
    buyerId:           r.buyerId,
    periodStart:       r.periodStart.toISOString(),
    periodEnd:         r.periodEnd.toISOString(),
    granularity:       r.granularity,
    chargeCount:       r.chargeCount,
    totalUsdc:         r.totalUsdc.toString(),
    totalJpy:          r.totalJpy,
    jpyRate:           r.jpyRate.toString(),
    accountingProvider: r.accountingProvider,
    externalDealId:    r.externalDealId,
    syncedAt:          r.syncedAt?.toISOString() ?? null,
    syncError:         r.syncError,
    serviceBreakdown:  r.serviceBreakdown,
    createdAt:         r.createdAt.toISOString(),
  };
}
