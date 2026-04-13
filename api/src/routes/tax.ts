/**
 * 税務判定 API ルート
 *
 * GET  /api/tax/invoice/:number  — 国税庁API照合
 * POST /api/tax/withholding      — 源泉徴収判定
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { checkInvoiceRegistration, checkWithholdingTax, hashEvidence } from "../lib/tax.js";

export const taxRouter = new Hono();

// ─── GET /api/tax/invoice/:number ────────────────────────────
// 適格請求書発行事業者の照合（国税庁 Web-API）
taxRouter.get("/invoice/:number", async (c) => {
  const number = c.req.param("number");
  const result = await checkInvoiceRegistration(number);

  // Evidence Chain: レスポンスをハッシュして監査証跡に含める
  const evidenceHash = hashEvidence(result);

  return c.json({
    ...result,
    evidenceHash,
    checkedAt: new Date().toISOString(),
  });
});

// ─── POST /api/tax/withholding ────────────────────────────────
// 源泉徴収対象判定（NLP キーワード分類 + 204条照合）
taxRouter.post(
  "/withholding",
  zValidator(
    "json",
    z.object({
      serviceDescription: z.string().min(1).max(500),
      grossAmountJpy:     z.number().int().positive(),
    }),
  ),
  (c) => {
    const { serviceDescription, grossAmountJpy } = c.req.valid("json");
    const result = checkWithholdingTax(serviceDescription, grossAmountJpy);
    return c.json({
      ...result,
      analyzedAt: new Date().toISOString(),
    });
  },
);

// ─── POST /api/tax/full-check ─────────────────────────────────
// インボイス照合 + 源泉判定を一括実行
taxRouter.post(
  "/full-check",
  zValidator(
    "json",
    z.object({
      registrationNumber: z.string(),
      serviceDescription: z.string().min(1).max(500),
      grossAmountJpy:     z.number().int().positive(),
    }),
  ),
  async (c) => {
    const { registrationNumber, serviceDescription, grossAmountJpy } = c.req.valid("json");

    const [invoice, withholding] = await Promise.all([
      checkInvoiceRegistration(registrationNumber),
      Promise.resolve(checkWithholdingTax(serviceDescription, grossAmountJpy)),
    ]);

    const evidenceHash = hashEvidence({ invoice, withholding });

    return c.json({
      invoice,
      withholding,
      evidenceHash,
      checkedAt: new Date().toISOString(),
    });
  },
);
