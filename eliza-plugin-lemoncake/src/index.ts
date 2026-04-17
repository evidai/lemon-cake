/**
 * eliza-plugin-lemoncake
 *
 * LEMONCake M2M Payment Plugin for Eliza v2 (@elizaos/core)
 *
 * Exports:
 *   - lemoncakePlugin  — Plugin オブジェクト（character.plugins に追加）
 *   - payAction        — EXECUTE_LEMONCAKE_PAYMENT アクション（単体利用も可）
 *   - LemoncakeClient  — 低レベル HTTP クライアント
 *   - LemoncakeError   — エラー型
 *   - 各種型定義
 */

import type { Plugin } from "@elizaos/core";
import { payAction } from "./actions/payAction.js";

// ─── Plugin エクスポート ───────────────────────────────────────────────────

export const lemoncakePlugin: Plugin = {
  name: "eliza-plugin-lemoncake",
  description:
    "LEMONCake M2M Payment plugin — enables autonomous USDC payments via JWT Pay Token " +
    "for Eliza AI agents. Supports pre-issued Pay Token (Quick Start) and on-demand " +
    "issuance via Buyer JWT (Production).",
  actions: [payAction],
};

// ─── 個別エクスポート ──────────────────────────────────────────────────────

export { payAction } from "./actions/payAction.js";
export { LemoncakeClient } from "./lib/lemoncakeClient.js";
export type {
  LemoncakeConfig,
  IssueTokenRequest,
  IssueTokenResponse,
  CallServiceRequest,
  CallServiceResponse,
  PaymentParams,
  LemoncakeErrorCode,
  ApiErrorBody,
} from "./types.js";
export { LemoncakeError } from "./types.js";

// ─── デフォルトエクスポート ────────────────────────────────────────────────

export default lemoncakePlugin;
