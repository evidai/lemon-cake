/**
 * M2M決済 自動会計ロールアップエンジン
 *
 * 数万件のChargeレコードを日次/月次で集計し、
 * freee / QuickBooks / Xero / Zoho などへ1本の仕訳として自動連携する。
 *
 * フロー:
 *   1. buildRollup()   — Chargeを集計してChargeRollupレコードを作成
 *   2. syncRollup()    — 会計ソフトにPOSTして externalDealId を記録
 *   3. runDailyRollup() — 前日分を自動で1〜2を実行（cronから呼ぶ）
 */

import { prisma } from "./prisma.js";
import { Decimal } from "@prisma/client/runtime/library";
import { createFreeeTransaction } from "./freee.js";
import { createMFTransaction } from "./money-forward.js";

// ─── JPY換算レート（固定フォールバック + 将来的に為替API連携）─
const DEFAULT_JPY_RATE = new Decimal("150"); // 1 USDC = 150 JPY

async function fetchJpyRate(): Promise<Decimal> {
  try {
    // TODO: 為替API（exchangerate-api等）を叩いてリアルタイム取得
    const env = process.env.USDC_JPY_RATE;
    if (env && /^\d+(\.\d+)?$/.test(env)) return new Decimal(env);
  } catch { /* フォールバック */ }
  return DEFAULT_JPY_RATE;
}

// ─── 集計結果の型 ────────────────────────────────────────────
export interface RollupResult {
  chargeCount:      number;
  totalUsdc:        Decimal;
  totalJpy:         number;
  jpyRate:          Decimal;
  serviceBreakdown: Record<string, { count: number; usdc: string; name: string }>;
}

// ─── 1. Chargeを集計 ─────────────────────────────────────────
export async function buildRollup(
  buyerId:     string,
  periodStart: Date,
  periodEnd:   Date,
  granularity: "DAILY" | "MONTHLY" = "DAILY",
): Promise<{ rollupId: string; result: RollupResult } | null> {

  // 既に同期間のロールアップがあれば再作成しない（冪等）
  const existing = await prisma.chargeRollup.findFirst({
    where: { buyerId, periodStart, periodEnd },
  });
  if (existing) return { rollupId: existing.id, result: JSON.parse(existing.serviceBreakdown as string ?? "{}") };

  // 完了済みChargeを集計
  const charges = await prisma.charge.findMany({
    where: {
      buyerId,
      status: "COMPLETED",
      createdAt: { gte: periodStart, lt: periodEnd },
    },
    include: { service: { select: { name: true } } },
  });

  if (charges.length === 0) return null;

  // サービス別内訳
  const breakdown: Record<string, { count: number; usdc: Decimal; name: string }> = {};
  let totalUsdc = new Decimal(0);

  for (const c of charges) {
    totalUsdc = totalUsdc.plus(c.amountUsdc);
    if (!breakdown[c.serviceId]) {
      breakdown[c.serviceId] = { count: 0, usdc: new Decimal(0), name: c.service.name };
    }
    breakdown[c.serviceId].count++;
    breakdown[c.serviceId].usdc = breakdown[c.serviceId].usdc.plus(c.amountUsdc);
  }

  const jpyRate  = await fetchJpyRate();
  const totalJpy = Math.floor(totalUsdc.times(jpyRate).toNumber());

  const serviceBreakdown = Object.fromEntries(
    Object.entries(breakdown).map(([id, v]) => [
      id, { count: v.count, usdc: v.usdc.toFixed(6), name: v.name },
    ])
  );

  const rollup = await prisma.chargeRollup.create({
    data: {
      buyerId,
      periodStart,
      periodEnd,
      granularity,
      chargeCount:     charges.length,
      totalUsdc,
      totalJpy,
      jpyRate,
      serviceBreakdown,
    },
  });

  return {
    rollupId: rollup.id,
    result:   { chargeCount: charges.length, totalUsdc, totalJpy, jpyRate, serviceBreakdown },
  };
}

// ─── 2. 会計ソフトへ同期 ─────────────────────────────────────
export async function syncRollup(rollupId: string): Promise<{
  success:       boolean;
  externalDealId?: string;
  error?:        string;
}> {
  const rollup = await prisma.chargeRollup.findUnique({
    where: { id: rollupId },
    include: {
      buyer: {
        include: { accountingConnections: { where: { active: true } } },
      },
    },
  });

  if (!rollup) return { success: false, error: "Rollup not found" };
  if (rollup.syncedAt) return { success: true, externalDealId: rollup.externalDealId ?? undefined };

  const conn = rollup.buyer.accountingConnections[0];
  if (!conn) return { success: false, error: "No accounting connection found" };

  const issueDate = rollup.periodStart.toISOString().slice(0, 10);

  // サービス内訳を摘要文に変換
  const breakdown = rollup.serviceBreakdown as Record<string, { count: number; usdc: string; name: string }>;
  const descLines = Object.values(breakdown)
    .map(v => `${v.name}: ${v.count}calls / $${v.usdc}`)
    .join(", ");
  const description = `LemonCake M2M API費用 ${issueDate} (${rollup.chargeCount}件) [${descLines}]`;

  try {
    let externalDealId: string | undefined;

    switch (conn.provider) {
      case "FREEE": {
        const result = await createFreeeTransaction({
          issueDate,
          description,
          amountUsdc:        rollup.totalUsdc.toFixed(6),
          amountJpy:         rollup.totalJpy,
          providerName:      "LemonCake Platform",
          invoiceRegistered: true,  // プラットフォームは適格事業者
        });
        externalDealId = String(result.dealId);
        break;
      }

      case "MONEYFORWARD": {
        const result = await createMFTransaction({
          issueDate,
          description,
          amountUsdc:        rollup.totalUsdc.toFixed(6),
          amountJpy:         rollup.totalJpy,
          providerName:      "LemonCake Platform",
          invoiceRegistered: true,
        });
        externalDealId = String(result.journalId);
        break;
      }

      case "QUICKBOOKS": {
        externalDealId = await syncToQuickBooks(conn, rollup, description);
        break;
      }

      case "XERO": {
        externalDealId = await syncToXero(conn, rollup, description, issueDate);
        break;
      }

      case "ZOHO": {
        externalDealId = await syncToZoho(conn, rollup, description, issueDate);
        break;
      }

      case "SAGE":
      case "NETSUITE":
      default:
        return { success: false, error: `Provider ${conn.provider} not yet supported for rollup` };
    }

    await prisma.chargeRollup.update({
      where: { id: rollupId },
      data: {
        accountingProvider: conn.provider,
        externalDealId,
        syncedAt:  new Date(),
        syncError: null,
      },
    });

    return { success: true, externalDealId };

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.chargeRollup.update({
      where: { id: rollupId },
      data: { syncError: msg },
    });
    return { success: false, error: msg };
  }
}

// ─── 3. 前日分の自動ロールアップ（cron用） ────────────────────
export async function runDailyRollup(): Promise<{
  processed: number;
  synced:    number;
  errors:    string[];
}> {
  const now        = new Date();
  const yesterday  = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const periodStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0);
  const periodEnd   = new Date(now.getFullYear(),       now.getMonth(),       now.getDate(),      0, 0, 0, 0);

  // 会計連携を持つ全バイヤーを対象
  const buyers = await prisma.buyer.findMany({
    where: {
      accountingConnections: { some: { active: true } },
      charges: {
        some: {
          status:    "COMPLETED",
          createdAt: { gte: periodStart, lt: periodEnd },
        },
      },
    },
    select: { id: true },
  });

  let processed = 0;
  let synced    = 0;
  const errors: string[] = [];

  for (const { id: buyerId } of buyers) {
    try {
      const built = await buildRollup(buyerId, periodStart, periodEnd, "DAILY");
      if (!built) continue;
      processed++;

      const result = await syncRollup(built.rollupId);
      if (result.success) {
        synced++;
      } else {
        errors.push(`${buyerId}: ${result.error}`);
      }
    } catch (err: unknown) {
      errors.push(`${buyerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[rollup] daily: processed=${processed} synced=${synced} errors=${errors.length}`);
  return { processed, synced, errors };
}

// ─── QuickBooks 仕訳連携 ──────────────────────────────────────
async function syncToQuickBooks(
  conn: { accessToken: string; externalId: string | null },
  rollup: { totalJpy: number; totalUsdc: Decimal },
  description: string,
): Promise<string> {
  const realmId = conn.externalId;
  if (!realmId) throw new Error("QuickBooks realmId not set");

  const body = {
    Line: [{
      Amount:     rollup.totalJpy,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType:  "Debit",
        AccountRef:   { name: "Software and Technology" },
        Entity:       { Name: "LemonCake Platform" },
      },
      Description: description,
    }, {
      Amount:     rollup.totalJpy,
      DetailType: "JournalEntryLineDetail",
      JournalEntryLineDetail: {
        PostingType: "Credit",
        AccountRef:  { name: "Checking" },
      },
    }],
    DocNumber: `LC-${Date.now()}`,
    TxnDate:   new Date().toISOString().slice(0, 10),
    PrivateNote: `USDC: ${rollup.totalUsdc.toFixed(6)}`,
  };

  const res = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/journalentry`,
    {
      method:  "POST",
      headers: {
        Authorization:   `Bearer ${conn.accessToken}`,
        "Content-Type":  "application/json",
        Accept:          "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`QuickBooks API error: ${res.status}`);
  const data = await res.json() as { JournalEntry: { Id: string } };
  return data.JournalEntry.Id;
}

// ─── Xero 仕訳連携 ───────────────────────────────────────────
async function syncToXero(
  conn: { accessToken: string; externalId: string | null },
  rollup: { totalJpy: number; totalUsdc: Decimal },
  description: string,
  date: string,
): Promise<string> {
  const tenantId = conn.externalId;
  if (!tenantId) throw new Error("Xero tenantId not set");

  const body = {
    Type:       "SPEND",
    Contact:    { Name: "LemonCake Platform" },
    Date:       date,
    LineAmountTypes: "Exclusive",
    LineItems:  [{
      Description: description,
      UnitAmount:  rollup.totalJpy,
      AccountCode: "461",  // Software/IT
      TaxType:     "INPUT2",
    }],
    Reference: `LEMON-${Date.now()}`,
  };

  const res = await fetch("https://api.xero.com/api.xro/2.0/BankTransactions", {
    method:  "POST",
    headers: {
      Authorization:   `Bearer ${conn.accessToken}`,
      "xero-tenant-id": tenantId,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ BankTransactions: [body] }),
  });
  if (!res.ok) throw new Error(`Xero API error: ${res.status}`);
  const data = await res.json() as { BankTransactions: Array<{ BankTransactionID: string }> };
  return data.BankTransactions[0].BankTransactionID;
}

// ─── Zoho Books 仕訳連携 ─────────────────────────────────────
async function syncToZoho(
  conn: { accessToken: string; externalId: string | null },
  rollup: { totalJpy: number; totalUsdc: Decimal },
  description: string,
  date: string,
): Promise<string> {
  const orgId = conn.externalId;
  if (!orgId) throw new Error("Zoho orgId not set");

  const region = process.env.ZOHO_REGION ?? "com";
  const body = {
    date,
    notes:       description,
    line_items:  [{
      line_item_type: "debit_notes",
      account_name:   "Software Charges",
      amount:         rollup.totalJpy,
      description,
    }, {
      line_item_type: "credit_notes",
      account_name:   "Cash",
      amount:         rollup.totalJpy,
    }],
    reference_number: `LC-${Date.now()}`,
  };

  const res = await fetch(
    `https://books.zoho.${region}/api/v3/journalentries?organization_id=${orgId}`,
    {
      method:  "POST",
      headers: {
        Authorization:  `Zoho-oauthtoken ${conn.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`Zoho API error: ${res.status}`);
  const data = await res.json() as { journal: { journal_id: string } };
  return data.journal.journal_id;
}
