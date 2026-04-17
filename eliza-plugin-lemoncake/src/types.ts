/**
 * LEMONCake Eliza Plugin — 型定義
 */

// ─── 設定 ──────────────────────────────────────────────────────────────────

export interface LemoncakeConfig {
  /** LEMONCake API ベースURL */
  apiUrl: string;
  /**
   * 事前発行済み Pay Token JWT。
   * 設定されている場合、トークン発行をスキップしてこれを直接使用する。
   * 設定されていない場合は buyerJwt で都度発行にフォールバック。
   */
  payToken: string | null;
  /**
   * Buyer JWT（POST /api/auth/buyer-login で取得）。
   * payToken が未設定の場合、アクション実行時に Pay Token を都度発行するために使用。
   */
  buyerJwt: string | null;
}

// ─── Pay Token ────────────────────────────────────────────────────────────

export interface IssueTokenRequest {
  serviceId: string;
  limitUsdc: string;
  buyerTag?: string;
  expiresAt?: string;
}

export interface IssueTokenResponse {
  tokenId: string;
  jwt: string;
  buyerId: string;
  serviceId: string;
  limitUsdc: string;
  expiresAt: string;
  createdAt: string;
}

// ─── プロキシ呼び出し ─────────────────────────────────────────────────────

export interface CallServiceRequest {
  serviceId: string;
  path?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface CallServiceResponse {
  status: number;
  chargeId: string | null;
  amountUsdc: string | null;
  response: unknown;
}

// ─── アクションの実行パラメータ ───────────────────────────────────────────

export interface PaymentParams {
  /** 呼び出すサービスID（LEMONCake マーケットプレイスの serviceId） */
  serviceId: string;
  /** Pay Token の上限額（USDC）例: "1.00" */
  limitUsdc: string;
  /** サービス内のサブパス 例: "/search" */
  path?: string;
  /** HTTP メソッド（デフォルト: POST） */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** リクエストボディ */
  body?: Record<string, unknown>;
  /** 監査ログ用のタグ（エージェントセッション識別子など） */
  buyerTag?: string;
}

// ─── エラー型 ─────────────────────────────────────────────────────────────

export type LemoncakeErrorCode =
  | "CREDENTIAL_MISSING"
  | "INSUFFICIENT_BALANCE"
  | "TOKEN_LIMIT_EXCEEDED"
  | "TOKEN_EXPIRED"
  | "SERVICE_NOT_FOUND"
  | "SERVICE_NOT_APPROVED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "API_ERROR"
  | "PARSE_ERROR";

export class LemoncakeError extends Error {
  constructor(
    public readonly code: LemoncakeErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "LemoncakeError";
  }
}

// ─── API レスポンス共通型 ─────────────────────────────────────────────────

export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
  retryAfter?: number;
}
