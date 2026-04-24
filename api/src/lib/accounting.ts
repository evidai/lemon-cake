/**
 * Per-Buyer Accounting Integrations
 *
 * Each Buyer connects their own accounting software via OAuth.
 * Journal entries are created in the Buyer's own accounting system
 * when their charges complete.
 *
 * Supported:
 *   QuickBooks Online  (OAuth 2.0)
 *   Xero               (OAuth 2.0)
 *   Zoho Books         (OAuth 2.0)
 *   Sage               (OAuth 2.0)
 *   Oracle NetSuite    (OAuth 1.0a TBA)
 *   freee              (OAuth 2.0)
 */

import crypto from "crypto";
import { prisma } from "./prisma.js";
import type { BuyerAccountingConnection } from "@prisma/client";

export type { BuyerAccountingConnection };

// ─────────────────────────────────────────────────────────────────────────────
// NetSuite accountId validation (SSRF prevention)
// ─────────────────────────────────────────────────────────────────────────────

const NETSUITE_ACCOUNT_ID_RE = /^[A-Za-z0-9_-]{4,50}$/;

export function validateNetSuiteAccountId(accountId: string): void {
  if (!NETSUITE_ACCOUNT_ID_RE.test(accountId)) {
    throw new Error(
      `Invalid NetSuite accountId: must be 4–50 alphanumeric/dash/underscore characters`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token encryption/decryption (AES-256-GCM)
// Storage format: iv:authTag:ciphertext  (all hex)
// ─────────────────────────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const secret = process.env.ACCOUNTING_TOKEN_SECRET ?? process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ACCOUNTING_TOKEN_SECRET (or JWT_SECRET) must be at least 32 chars");
  }
  // Derive a 32-byte key from the secret via SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(token: string): string {
  if (!token) return token;
  const key = getEncryptionKey();
  const iv  = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encrypted: string): string {
  if (!encrypted) return encrypted;
  // If it doesn't look like our format, treat as plaintext (migration path)
  const parts = encrypted.split(":");
  if (parts.length !== 3) return encrypted;
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key        = getEncryptionKey();
  const iv         = Buffer.from(ivHex, "hex");
  const authTag    = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher   = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Journal entry data passed to all providers
// ─────────────────────────────────────────────────────────────────────────────

export interface JournalEntryData {
  date:         string;  // "YYYY-MM-DD"
  description:  string;
  amountUsdc:   number;
  amountJpy?:   number;
  serviceName:  string;
  providerName: string;
  chargeId:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared OAuth 2.0 refresh helper
// ─────────────────────────────────────────────────────────────────────────────

async function refreshOAuth2(
  tokenUrl:     string,
  clientId:     string,
  clientSecret: string,
  refreshToken: string,
  useBasicAuth = false,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const bodyParams: Record<string, string> = {
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
  };

  if (useBasicAuth) {
    headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    bodyParams["client_id"]     = clientId;
    bodyParams["client_secret"] = clientSecret;
  }

  const res = await fetch(tokenUrl, {
    method:  "POST",
    headers,
    body:    new URLSearchParams(bodyParams).toString(),
  });

  if (!res.ok) {
    // Do NOT include response body — it may contain token values
    throw new Error(`OAuth2 refresh failed [${res.status}]`);
  }

  const d = await res.json() as {
    access_token: string; refresh_token?: string; expires_in?: number;
  };
  return {
    accessToken:  d.access_token,
    refreshToken: d.refresh_token ?? refreshToken,
    expiresIn:    d.expires_in ?? 3600,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// refreshConnectionToken — refresh OAuth token for a BuyerAccountingConnection
// and persist to DB. Returns the new access token (plaintext).
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshConnectionToken(
  conn: BuyerAccountingConnection,
): Promise<string> {
  if (!conn.refreshToken) {
    throw new Error(`No refresh token for connection ${conn.id} (${conn.provider})`);
  }

  // Decrypt stored refresh token before use
  const plainRefreshToken = decryptToken(conn.refreshToken);

  let result: { accessToken: string; refreshToken: string; expiresIn: number };

  switch (conn.provider) {
    case "QUICKBOOKS":
      result = await refreshOAuth2(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        process.env.QB_CLIENT_ID ?? "",
        process.env.QB_CLIENT_SECRET ?? "",
        plainRefreshToken,
      );
      break;

    case "XERO":
      result = await refreshOAuth2(
        "https://identity.xero.com/connect/token",
        process.env.XERO_CLIENT_ID ?? "",
        process.env.XERO_CLIENT_SECRET ?? "",
        plainRefreshToken,
        true, // Xero uses HTTP Basic auth
      );
      break;

    case "ZOHO": {
      const region = process.env.ZOHO_REGION ?? "com";
      result = await refreshOAuth2(
        `https://accounts.zoho.${region}/oauth/v2/token`,
        process.env.ZOHO_CLIENT_ID ?? "",
        process.env.ZOHO_CLIENT_SECRET ?? "",
        plainRefreshToken,
      );
      break;
    }

    case "SAGE":
      result = await refreshOAuth2(
        "https://oauth.accounting.sage.com/token",
        process.env.SAGE_CLIENT_ID ?? "",
        process.env.SAGE_CLIENT_SECRET ?? "",
        plainRefreshToken,
      );
      break;

    case "FREEE":
      result = await refreshOAuth2(
        "https://accounts.secure.freee.co.jp/public_api/token",
        process.env.FREEE_CLIENT_ID ?? "",
        process.env.FREEE_CLIENT_SECRET ?? "",
        plainRefreshToken,
      );
      break;

    case "NETSUITE":
      throw new Error("NetSuite uses OAuth 1.0a TBA — no token refresh needed");

    default:
      throw new Error(`Unknown provider: ${conn.provider}`);
  }

  // Encrypt before persisting
  await prisma.buyerAccountingConnection.update({
    where: { id: conn.id },
    data:  {
      accessToken:  encryptToken(result.accessToken),
      refreshToken: encryptToken(result.refreshToken),
    },
  });

  console.log(`[Accounting] ${conn.provider} token refreshed for buyerId: ${conn.buyerId.slice(0, 8)}...`);
  return result.accessToken; // Return plaintext for immediate use
}

// ─────────────────────────────────────────────────────────────────────────────
// createJournalEntry — dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export async function createJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  switch (conn.provider) {
    case "QUICKBOOKS":
      return createQuickBooksJournalEntry(conn, data);
    case "XERO":
      return createXeroJournalEntry(conn, data);
    case "ZOHO":
      return createZohoJournalEntry(conn, data);
    case "SAGE":
      return createSageJournalEntry(conn, data);
    case "NETSUITE":
      return createNetSuiteJournalEntry(conn, data);
    case "FREEE":
      return createFreeeJournalEntry(conn, data);
    default:
      throw new Error(`Unknown accounting provider: ${conn.provider}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks Online
// ─────────────────────────────────────────────────────────────────────────────

export async function createQuickBooksJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  if (!conn.externalId) throw new Error("QuickBooks realmId (externalId) is not set");

  const amount = data.amountUsdc;
  const body = {
    Line: [
      {
        Amount: amount,
        DetailType: "JournalEntryLineDetail",
        JournalEntryLineDetail: {
          PostingType: "Debit",
          AccountRef: { name: conn.expenseAccountRef ?? "API Expenses" },
        },
      },
      {
        Amount: amount,
        DetailType: "JournalEntryLineDetail",
        JournalEntryLineDetail: {
          PostingType: "Credit",
          AccountRef: { name: conn.cashAccountRef ?? "Cash and cash equivalents" },
        },
      },
    ],
    TxnDate: data.date,
    PrivateNote: data.description,
  };

  const url = `https://quickbooks.api.intuit.com/v3/company/${conn.externalId}/journalentry`;

  // Decrypt stored access token for use
  let accessToken = decryptToken(conn.accessToken);
  let res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
      "Accept":        "application/json",
    },
    body: JSON.stringify(body),
  });

  // Auto-refresh on 401 — use freshly returned plaintext token
  if (res.status === 401) {
    accessToken = await refreshConnectionToken(conn);
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    // Sanitize: do not log response body which may contain sensitive data
    throw new Error(`QuickBooks journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Xero
// ─────────────────────────────────────────────────────────────────────────────

export async function createXeroJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  if (!conn.externalId) throw new Error("Xero tenantId (externalId) is not set");

  const amount = data.amountUsdc;
  const body = {
    Date: data.date,
    Narration: data.description,
    JournalLines: [
      {
        AccountCode:  conn.expenseAccountRef ?? "300",
        Description:  data.description,
        LineAmount:   amount,
      },
      {
        AccountCode:  conn.cashAccountRef ?? "090",
        Description:  data.description,
        LineAmount:   -amount,
      },
    ],
  };

  const url = "https://api.xero.com/api.xro/2.0/ManualJournals";

  let accessToken = decryptToken(conn.accessToken);
  let res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization":  `Bearer ${accessToken}`,
      "Xero-tenant-id": conn.externalId,
      "Content-Type":   "application/json",
      "Accept":         "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    accessToken = await refreshConnectionToken(conn);
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization":  `Bearer ${accessToken}`,
        "Xero-tenant-id": conn.externalId,
        "Content-Type":   "application/json",
        "Accept":         "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    throw new Error(`Xero journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoho Books
// ─────────────────────────────────────────────────────────────────────────────

export async function createZohoJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  if (!conn.externalId) throw new Error("Zoho orgId (externalId) is not set");

  const amount = data.amountUsdc;
  const body = {
    journal_date: data.date,
    notes: data.description,
    line_items: [
      {
        account_name:    conn.expenseAccountRef ?? "API Expenses",
        debit_or_credit: "debit",
        amount,
      },
      {
        account_name:    conn.cashAccountRef ?? "Cash",
        debit_or_credit: "credit",
        amount,
      },
    ],
  };

  const url = `https://www.zohoapis.com/books/v3/journals?organization_id=${conn.externalId}`;

  let accessToken = decryptToken(conn.accessToken);
  let res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Zoho-oauthtoken ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    accessToken = await refreshConnectionToken(conn);
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Zoho-oauthtoken ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    throw new Error(`Zoho journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sage
// ─────────────────────────────────────────────────────────────────────────────

export async function createSageJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  const amount = data.amountUsdc;
  const body = {
    date: data.date,
    reference: `LEMON-${data.chargeId}`,
    journal_entry_lines: [
      {
        ledger_account: { displayed_as: conn.expenseAccountRef ?? "API Expenses" },
        debit: amount,
      },
      {
        ledger_account: { displayed_as: conn.cashAccountRef ?? "Bank Account" },
        credit: amount,
      },
    ],
  };

  const url = "https://api.accounting.sage.com/v3.1/journal_entries";

  let accessToken = decryptToken(conn.accessToken);
  let res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    accessToken = await refreshConnectionToken(conn);
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    throw new Error(`Sage journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Oracle NetSuite (OAuth 1.0a TBA)
// ─────────────────────────────────────────────────────────────────────────────

function buildNetSuiteAuthHeader(
  method:          string,
  url:             string,
  accountId:       string,
  consumerKey:     string,
  consumerSecret:  string,
  tokenId:         string,
  tokenSecret:     string,
): string {
  const nonce     = crypto.randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const realm     = accountId.toUpperCase().replace(/-/g, "_");

  const params: Record<string, string> = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp:        timestamp,
    oauth_token:            tokenId,
    oauth_version:          "1.0",
  };

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

export async function createNetSuiteJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  if (!conn.nsAccountId || !conn.nsConsumerKey || !conn.nsConsumerSecret || !conn.nsTokenId || !conn.nsTokenSecret) {
    throw new Error("NetSuite TBA credentials are not fully configured for this connection");
  }

  // SSRF prevention: validate accountId format
  validateNetSuiteAccountId(conn.nsAccountId);

  const amount = data.amountUsdc;
  const accountId = conn.nsAccountId.toUpperCase().replace(/-/g, "_");
  const url = `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1/journalentry`;

  // Decrypt stored credentials
  const consumerKey    = decryptToken(conn.nsConsumerKey);
  const consumerSecret = decryptToken(conn.nsConsumerSecret);
  const tokenId        = decryptToken(conn.nsTokenId);
  const tokenSecret    = decryptToken(conn.nsTokenSecret);

  const body = {
    memo: data.description,
    trandate: data.date,
    line: {
      items: [
        {
          account: { id: conn.expenseAccountRef ?? "1" },
          debit: amount,
          memo: data.description,
        },
        {
          account: { id: conn.cashAccountRef ?? "1000" },
          credit: amount,
          memo: data.description,
        },
      ],
    },
  };

  const authHeader = buildNetSuiteAuthHeader(
    "POST",
    url,
    conn.nsAccountId,
    consumerKey,
    consumerSecret,
    tokenId,
    tokenSecret,
  );

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`NetSuite journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// freee (per-buyer, using conn.accessToken)
// ─────────────────────────────────────────────────────────────────────────────

export async function createFreeeJournalEntry(
  conn: BuyerAccountingConnection,
  data: JournalEntryData,
): Promise<void> {
  if (!conn.externalId) throw new Error("freee company_id (externalId) is not set");

  const amountJpy = data.amountJpy ?? Math.round(data.amountUsdc * Number(process.env.JPY_USDC_RATE ?? "150"));

  const body = {
    deal_type: "expense",
    company_id: Number(conn.externalId),
    issue_date: data.date,
    description: data.description,
    details: [
      {
        account_item_id: conn.expenseAccountRef ? Number(conn.expenseAccountRef) : undefined,
        tax_code: 1,
        amount: amountJpy,
        entry_side: "debit",
        description: data.description,
      },
      {
        account_item_id: conn.cashAccountRef ? Number(conn.cashAccountRef) : undefined,
        tax_code: 1,
        amount: amountJpy,
        entry_side: "credit",
        description: data.description,
      },
    ],
  };

  const url = "https://api.freee.co.jp/api/1/manual_journals";

  let accessToken = decryptToken(conn.accessToken);
  let res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    accessToken = await refreshConnectionToken(conn);
    res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  // 403 = token が有効だが scope/権限不足 → 再認可 (scope upgrade) が必要
  // connection を inactive にして、ダッシュボードが「再接続」ボタンを出せるようにする
  if (res.status === 403) {
    try {
      await prisma.buyerAccountingConnection.update({
        where: { id: conn.id },
        data:  { active: false },
      });
    } catch (dbErr) {
      console.error("[freee] failed to mark connection inactive after 403:", dbErr);
    }
    const err = new Error("freee journal entry failed [403]: scope upgrade required — user must re-authorize");
    (err as Error & { needsReauth?: boolean }).needsReauth = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`freee journal entry failed [${res.status}]`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Xero: get tenantId after OAuth callback
// ─────────────────────────────────────────────────────────────────────────────

export async function getXeroTenantId(accessToken: string): Promise<string> {
  const res = await fetch("https://api.xero.com/connections", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type":  "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Xero GET /connections failed [${res.status}]`);
  }

  const connections = await res.json() as Array<{ tenantId: string; tenantName?: string }>;
  if (!connections.length) throw new Error("No Xero connections found");

  return connections[0].tenantId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoho: get orgId after OAuth callback
// ─────────────────────────────────────────────────────────────────────────────

export async function getZohoOrgId(accessToken: string, region = "com"): Promise<string> {
  const res = await fetch(`https://www.zohoapis.${region}/books/v3/organizations`, {
    headers: {
      "Authorization": `Zoho-oauthtoken ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Zoho GET /organizations failed [${res.status}]`);
  }

  const d = await res.json() as { organizations?: Array<{ organization_id: string; name?: string }> };
  const orgs = d.organizations ?? [];
  if (!orgs.length) throw new Error("No Zoho organizations found");

  return orgs[0].organization_id;
}
