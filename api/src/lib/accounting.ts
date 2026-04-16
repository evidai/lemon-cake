/**
 * Global Accounting Integrations — OAuth Token Management
 *
 * Supported:
 *   QuickBooks Online  (OAuth 2.0)
 *   Xero               (OAuth 2.0)
 *   Zoho Books         (OAuth 2.0)
 *   Sage               (OAuth 2.0)
 *   Oracle NetSuite    (OAuth 1.0a TBA)
 */

import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Shared OAuth 2.0 helpers
// ─────────────────────────────────────────────────────────────────────────────

async function refreshOAuth2(
  tokenUrl:     string,
  clientId:     string,
  clientSecret: string,
  refreshToken: string,
  extraBody?:   Record<string, string>,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    ...extraBody,
  });

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OAuth2 refresh failed [${res.status}]: ${err}`);
  }

  const d = await res.json() as {
    access_token: string; refresh_token?: string; expires_in?: number;
  };
  return {
    accessToken:  d.access_token,
    refreshToken: d.refresh_token ?? refreshToken, // some providers don't rotate
    expiresIn:    d.expires_in ?? 3600,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks Online (Intuit)
// Env: QB_CLIENT_ID, QB_CLIENT_SECRET, QB_ACCESS_TOKEN, QB_REFRESH_TOKEN, QB_REALM_ID
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshQuickBooksToken(): Promise<string> {
  const refreshToken = process.env.QB_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("QB_REFRESH_TOKEN is not set");

  const result = await refreshOAuth2(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    process.env.QB_CLIENT_ID ?? "",
    process.env.QB_CLIENT_SECRET ?? "",
    refreshToken,
  );

  // Persist new tokens back to env (Railway/process memory until restart)
  process.env.QB_ACCESS_TOKEN  = result.accessToken;
  process.env.QB_REFRESH_TOKEN = result.refreshToken;

  console.log("[QuickBooks] token refreshed");
  return result.accessToken;
}

export function getQuickBooksAuthHeader(): string {
  const token = process.env.QB_ACCESS_TOKEN;
  if (!token) throw new Error("QB_ACCESS_TOKEN is not set");
  return `Bearer ${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Xero
// Env: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_ACCESS_TOKEN,
//      XERO_REFRESH_TOKEN, XERO_TENANT_ID
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshXeroToken(): Promise<string> {
  const refreshToken = process.env.XERO_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("XERO_REFRESH_TOKEN is not set");

  // Xero uses HTTP Basic auth for token refresh (client_id:client_secret)
  const clientId     = process.env.XERO_CLIENT_ID ?? "";
  const clientSecret = process.env.XERO_CLIENT_SECRET ?? "";
  const basicAuth    = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://identity.xero.com/connect/token", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Xero token refresh failed [${res.status}]: ${err}`);
  }

  const d = await res.json() as { access_token: string; refresh_token: string };
  process.env.XERO_ACCESS_TOKEN  = d.access_token;
  process.env.XERO_REFRESH_TOKEN = d.refresh_token;

  console.log("[Xero] token refreshed");
  return d.access_token;
}

export function getXeroAuthHeaders(): Record<string, string> {
  const token    = process.env.XERO_ACCESS_TOKEN;
  const tenantId = process.env.XERO_TENANT_ID;
  if (!token)    throw new Error("XERO_ACCESS_TOKEN is not set");
  if (!tenantId) throw new Error("XERO_TENANT_ID is not set");
  return {
    "Authorization": `Bearer ${token}`,
    "Xero-tenant-id": tenantId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoho Books
// Env: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_ACCESS_TOKEN,
//      ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID, ZOHO_REGION (default: com)
// Region: com / eu / in / com.au / jp
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshZohoToken(): Promise<string> {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("ZOHO_REFRESH_TOKEN is not set");

  const region = process.env.ZOHO_REGION ?? "com";

  const result = await refreshOAuth2(
    `https://accounts.zoho.${region}/oauth/v2/token`,
    process.env.ZOHO_CLIENT_ID ?? "",
    process.env.ZOHO_CLIENT_SECRET ?? "",
    refreshToken,
  );

  process.env.ZOHO_ACCESS_TOKEN  = result.accessToken;
  process.env.ZOHO_REFRESH_TOKEN = result.refreshToken;

  console.log("[Zoho Books] token refreshed");
  return result.accessToken;
}

export function getZohoAuthHeader(): string {
  const token = process.env.ZOHO_ACCESS_TOKEN;
  if (!token) throw new Error("ZOHO_ACCESS_TOKEN is not set");
  return `Zoho-oauthtoken ${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sage (Sage Accounting / Intacct)
// Env: SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, SAGE_ACCESS_TOKEN, SAGE_REFRESH_TOKEN
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshSageToken(): Promise<string> {
  const refreshToken = process.env.SAGE_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("SAGE_REFRESH_TOKEN is not set");

  const result = await refreshOAuth2(
    "https://oauth.accounting.sage.com/token",
    process.env.SAGE_CLIENT_ID ?? "",
    process.env.SAGE_CLIENT_SECRET ?? "",
    refreshToken,
  );

  process.env.SAGE_ACCESS_TOKEN  = result.accessToken;
  process.env.SAGE_REFRESH_TOKEN = result.refreshToken;

  console.log("[Sage] token refreshed");
  return result.accessToken;
}

export function getSageAuthHeader(): string {
  const token = process.env.SAGE_ACCESS_TOKEN;
  if (!token) throw new Error("SAGE_ACCESS_TOKEN is not set");
  return `Bearer ${token}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Oracle NetSuite  (OAuth 1.0a Token-Based Authentication)
// Env: NETSUITE_ACCOUNT_ID, NETSUITE_CONSUMER_KEY, NETSUITE_CONSUMER_SECRET,
//      NETSUITE_TOKEN_ID, NETSUITE_TOKEN_SECRET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate OAuth 1.0a Authorization header for NetSuite TBA.
 * NetSuite uses HMAC-SHA256 (not HMAC-SHA1).
 */
export function getNetSuiteAuthHeader(
  method:  string,
  url:     string,
): string {
  const accountId      = process.env.NETSUITE_ACCOUNT_ID ?? "";
  const consumerKey    = process.env.NETSUITE_CONSUMER_KEY ?? "";
  const consumerSecret = process.env.NETSUITE_CONSUMER_SECRET ?? "";
  const tokenId        = process.env.NETSUITE_TOKEN_ID ?? "";
  const tokenSecret    = process.env.NETSUITE_TOKEN_SECRET ?? "";

  if (!accountId || !consumerKey || !consumerSecret || !tokenId || !tokenSecret) {
    throw new Error("NETSUITE_* environment variables are not fully configured");
  }

  const nonce     = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const realm     = accountId.toUpperCase().replace(/-/g, "_");

  // Build base string
  const params: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp:        timestamp,
    oauth_token:            tokenId,
    oauth_version:          "1.0",
  };

  // Parse URL query params and merge for signature
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((v, k) => { params[k] = v; });

  const sortedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const baseUrl    = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  const baseString = [method.toUpperCase(), encodeURIComponent(baseUrl), encodeURIComponent(sortedParams)].join("&");

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature  = crypto.createHmac("sha256", signingKey).update(baseString).digest("base64");

  return [
    `OAuth realm="${realm}"`,
    `oauth_consumer_key="${consumerKey}"`,
    `oauth_token="${tokenId}"`,
    `oauth_signature_method="HMAC-SHA256"`,
    `oauth_timestamp="${timestamp}"`,
    `oauth_nonce="${nonce}"`,
    `oauth_version="1.0"`,
    `oauth_signature="${encodeURIComponent(signature)}"`,
  ].join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified: detect service by endpoint and return refreshed token
// Called by proxy on 401
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshTokenForEndpoint(endpoint: string): Promise<string | null> {
  if (endpoint.includes("quickbooks.api.intuit.com")) {
    return refreshQuickBooksToken();
  }
  if (endpoint.includes("api.xero.com")) {
    return refreshXeroToken();
  }
  if (endpoint.includes("zohoapis.com")) {
    return refreshZohoToken();
  }
  if (endpoint.includes("accounting.sage.com")) {
    return refreshSageToken();
  }
  // NetSuite: no token to refresh (OAuth 1.0a is stateless per-request)
  return null;
}

/**
 * Get the Xero tenant-id header value (needed as extra header in proxy).
 * Returns empty string if not set.
 */
export function getXeroTenantId(): string {
  return process.env.XERO_TENANT_ID ?? "";
}
