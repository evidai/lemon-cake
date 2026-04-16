/**
 * /api/accounting — Per-Buyer Accounting Integration Routes
 *
 * Buyers connect their own accounting software via OAuth.
 * Supported: QuickBooks, Xero, Zoho, Sage, NetSuite, freee
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma.js";
import { requireBuyerAuth } from "../middleware/buyerAuth.js";
import { getXeroTenantId, getZohoOrgId } from "../lib/accounting.js";

export const accountingRouter = new Hono();

// ─── Helper: get buyerId from context ────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBuyerId(c: any): string {
  return (c as never as { get: (k: string) => string }).get("buyerId");
}

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
} as const;

type OAuthProvider = keyof typeof OAUTH_CONFIGS;

const CALLBACK_BASE_URL =
  process.env.CALLBACK_BASE_URL ?? "https://skillful-blessing-production.up.railway.app";
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ?? "https://lemoncake.xyz";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be set");
  return new TextEncoder().encode(secret);
}

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

  const conn = await prisma.buyerAccountingConnection.findUnique({ where: { id } });
  if (!conn || conn.buyerId !== buyerId) {
    throw new HTTPException(404, { message: "Connection not found" });
  }

  await prisma.buyerAccountingConnection.delete({ where: { id } });
  return c.json({ ok: true });
});

// ─── PATCH /connections/:id — update account refs ────────────────────────────
accountingRouter.patch("/connections/:id", requireBuyerAuth, async (c) => {
  const buyerId = getBuyerId(c);
  const id      = c.req.param("id");

  const conn = await prisma.buyerAccountingConnection.findUnique({ where: { id } });
  if (!conn || conn.buyerId !== buyerId) {
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

  const body = await c.req.json() as {
    nsAccountId:      string;
    nsConsumerKey:    string;
    nsConsumerSecret: string;
    nsTokenId:        string;
    nsTokenSecret:    string;
    expenseAccountRef?: string;
    cashAccountRef?:    string;
  };

  if (!body.nsAccountId || !body.nsConsumerKey || !body.nsConsumerSecret ||
      !body.nsTokenId   || !body.nsTokenSecret) {
    throw new HTTPException(400, { message: "All NetSuite TBA fields are required" });
  }

  const connection = await prisma.buyerAccountingConnection.upsert({
    where:  { buyerId_provider: { buyerId, provider: "NETSUITE" } },
    create: {
      buyerId,
      provider:         "NETSUITE",
      accessToken:      "",  // NetSuite TBA has no access token
      nsAccountId:      body.nsAccountId,
      nsConsumerKey:    body.nsConsumerKey,
      nsConsumerSecret: body.nsConsumerSecret,
      nsTokenId:        body.nsTokenId,
      nsTokenSecret:    body.nsTokenSecret,
      expenseAccountRef: body.expenseAccountRef,
      cashAccountRef:   body.cashAccountRef,
    },
    update: {
      nsAccountId:      body.nsAccountId,
      nsConsumerKey:    body.nsConsumerKey,
      nsConsumerSecret: body.nsConsumerSecret,
      nsTokenId:        body.nsTokenId,
      nsTokenSecret:    body.nsTokenSecret,
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

  const clientId = process.env[config.clientIdEnv];
  if (!clientId) {
    throw new HTTPException(500, { message: `${config.clientIdEnv} is not configured` });
  }

  // Sign a state JWT containing buyerId + provider + nonce
  const state = await new SignJWT({ buyerId, provider: providerParam, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecret());

  const redirectUri = `${CALLBACK_BASE_URL}/api/accounting/oauth/callback/${providerParam}`;

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: "code",
    scope:         config.scope,
    redirect_uri:  redirectUri,
    state,
  });

  // QuickBooks requires response_type=code and specific format
  const url = `${config.authUrl}?${params.toString()}`;

  return c.json({ url });
});

// ─── GET /oauth/callback/:provider — handle OAuth callback ───────────────────
accountingRouter.get("/oauth/callback/:provider", async (c) => {
  const providerParam = c.req.param("provider").toLowerCase() as OAuthProvider;
  const config = OAUTH_CONFIGS[providerParam];
  if (!config) {
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=unknown_provider`);
  }

  const { code, state, error, realmId } = c.req.query() as {
    code?:    string;
    state?:   string;
    error?:   string;
    realmId?: string;
  };

  if (error || !code || !state) {
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=${encodeURIComponent(error ?? "missing_code")}`);
  }

  // Verify state JWT
  let statePayload: { buyerId: string; provider: string; nonce: string };
  try {
    const { payload } = await jwtVerify(state, getJwtSecret());
    statePayload = payload as typeof statePayload;
  } catch {
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=invalid_state`);
  }

  if (statePayload.provider !== providerParam) {
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=state_mismatch`);
  }

  const { buyerId } = statePayload;

  const clientId     = process.env[config.clientIdEnv]     ?? "";
  const clientSecret = process.env[config.clientSecretEnv] ?? "";

  const redirectUri = `${CALLBACK_BASE_URL}/api/accounting/oauth/callback/${providerParam}`;

  // Exchange code for tokens
  let accessToken:  string;
  let refreshToken: string | undefined;

  try {
    const useBasicAuth = providerParam === "xero";

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
      const err = await tokenRes.text().catch(() => "");
      console.error(`[Accounting] Token exchange failed for ${providerParam}:`, err);
      return c.redirect(`${DASHBOARD_URL}/?accounting_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string; refresh_token?: string;
    };
    accessToken  = tokenData.access_token;
    refreshToken = tokenData.refresh_token;
  } catch (err) {
    console.error(`[Accounting] Token exchange error for ${providerParam}:`, err);
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
    console.error(`[Accounting] Failed to get externalId for ${providerParam}:`, err);
    // Non-fatal: continue saving connection without externalId
  }

  // Map provider param to Prisma enum
  const providerEnum = providerParam.toUpperCase() as
    "QUICKBOOKS" | "XERO" | "ZOHO" | "SAGE" | "FREEE";

  // Upsert connection
  try {
    await prisma.buyerAccountingConnection.upsert({
      where:  { buyerId_provider: { buyerId, provider: providerEnum } },
      create: {
        buyerId,
        provider:     providerEnum,
        accessToken,
        refreshToken,
        externalId,
        externalName,
        active: true,
      },
      update: {
        accessToken,
        refreshToken,
        externalId,
        externalName,
        active: true,
      },
    });
  } catch (err) {
    console.error(`[Accounting] DB upsert failed for ${providerParam}:`, err);
    return c.redirect(`${DASHBOARD_URL}/?accounting_error=db_error`);
  }

  return c.redirect(`${DASHBOARD_URL}/?accounting_connected=true&provider=${providerParam}`);
});
