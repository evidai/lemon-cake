/**
 * KYB API ルート
 *
 * GET  /api/kyb/:corporateNumber              — 法人番号で KYB チェック
 * POST /api/kyb/check                         — 詳細パラメータで KYB チェック
 */

import { Hono }        from "hono";
import { zValidator }  from "@hono/zod-validator";
import { z }           from "zod";
import { runKybCheck } from "../lib/kyb.js";
import { adminAuth } from "../middleware/auth.js";

export const kybRouter = new Hono();

// ─── GET /api/kyb/:corporateNumber ───────────────────────────
kybRouter.get("/:corporateNumber", adminAuth, async (c) => {
  const corporateNumber = c.req.param("corporateNumber");
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0].trim()
             ?? c.req.header("CF-Connecting-IP")
             ?? undefined;

  const result = await runKybCheck({ corporateNumber, requesterIp: ip });
  const status = result.verdict === "BLOCKED" ? 403
               : result.verdict === "REVIEW"  ? 202
               : 200;

  return c.json(result, status as 200 | 202 | 403);
});

// ─── POST /api/kyb/check ─────────────────────────────────────
const CheckBody = z.object({
  corporateNumber:            z.string().regex(/^\d{13}$/).optional(),
  invoiceRegistrationNumber:  z.string().regex(/^T\d{13}$/).optional(),
  requesterIp:                z.string().optional(),
});

kybRouter.post("/check", adminAuth, zValidator("json", CheckBody), async (c) => {
  const body = c.req.valid("json");
  const result = await runKybCheck(body);
  const status = result.verdict === "BLOCKED" ? 403
               : result.verdict === "REVIEW"  ? 202
               : 200;

  return c.json(result, status as 200 | 202 | 403);
});
