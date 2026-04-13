/**
 * Proprietary Compliance Engine
 *
 * Enforces KYA/KYC tiers and transaction limits aligned with Japan's
 * Payment Services Act (資金決済法 / PSA) and FATF travel rule requirements.
 *
 * Tier definitions:
 * ┌─────────┬──────────────────────────────────────┬─────────────────────────────────────┐
 * │ Tier    │ Verification                         │ Limits                              │
 * ├─────────┼──────────────────────────────────────┼─────────────────────────────────────┤
 * │ none    │ No verification                      │ ≤ 0.000001 SOL / ¥100 JPYC per tx  │
 * │         │                                      │ ≤ 0.001 SOL / ¥1,000 JPYC daily    │
 * ├─────────┼──────────────────────────────────────┼─────────────────────────────────────┤
 * │ kya     │ KYA JWT (Skyfire identity service)   │ ≤ 0.01 SOL / ¥10,000 JPYC per tx   │
 * │         │                                      │ ≤ 1.0 SOL / ¥100,000 JPYC daily    │
 * ├─────────┼──────────────────────────────────────┼─────────────────────────────────────┤
 * │ kyc     │ Full KYC (org-level verification)    │ Unlimited (subject to AML review)   │
 * └─────────┴──────────────────────────────────────┴─────────────────────────────────────┘
 *
 * PSA micro-payment exemption (第37条):
 *   Transactions < ¥10,000 equivalent are exempt from fund transfer regulations.
 *   This maps to the "none" tier for small agent micro-payments.
 */

import prisma from "./prisma";

// ─── Tier Limits ──────────────────────────────────────────────────────────────

interface TierLimits {
  singleTxSOL: number;
  singleTxJPYC: number;
  dailySOL: number;
  dailyJPYC: number;
  weeklySOL: number;
  weeklyJPYC: number;
  monthlySOL: number;
  monthlyJPYC: number;
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  none: {
    singleTxSOL: 0.000001,
    singleTxJPYC: 100,
    dailySOL: 0.001,
    dailyJPYC: 1_000,
    weeklySOL: 0.005,
    weeklyJPYC: 5_000,
    monthlySOL: 0.01,
    monthlyJPYC: 10_000,
  },
  kya: {
    singleTxSOL: 0.01,
    singleTxJPYC: 10_000,
    dailySOL: 1.0,
    dailyJPYC: 100_000,
    weeklySOL: 5.0,
    weeklyJPYC: 500_000,
    monthlySOL: 20.0,
    monthlyJPYC: 2_000_000,
  },
  kyc: {
    singleTxSOL: Infinity,
    singleTxJPYC: Infinity,
    dailySOL: Infinity,
    dailyJPYC: Infinity,
    weeklySOL: Infinity,
    weeklyJPYC: Infinity,
    monthlySOL: Infinity,
    monthlyJPYC: Infinity,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComplianceCheck {
  allowed: boolean;
  reason?: string;
  requiredTier?: string;
}

// ─── Compliance check ─────────────────────────────────────────────────────────

/**
 * Check whether a proposed transaction is compliant for the agent's tier.
 */
export async function checkCompliance(
  agentId: string,
  amount: number,
  currency: "SOL" | "USDC" | "JPYC"
): Promise<ComplianceCheck> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { complianceTier: true },
  });

  if (!agent) return { allowed: false, reason: "Agent not found" };

  const tier = agent.complianceTier as keyof typeof TIER_LIMITS;
  const limits = TIER_LIMITS[tier] ?? TIER_LIMITS.none;

  // Currency-specific single-tx limit
  if (currency === "JPYC") {
    if (amount > limits.singleTxJPYC) {
      const required = amount > TIER_LIMITS.kya.singleTxJPYC ? "kyc" : "kya";
      return {
        allowed: false,
        reason: `JPYC amount ${amount} exceeds tier '${tier}' single-tx limit of ${limits.singleTxJPYC}`,
        requiredTier: required,
      };
    }
  } else {
    if (amount > limits.singleTxSOL) {
      const required = amount > TIER_LIMITS.kya.singleTxSOL ? "kyc" : "kya";
      return {
        allowed: false,
        reason: `${currency} amount ${amount} exceeds tier '${tier}' single-tx limit of ${limits.singleTxSOL}`,
        requiredTier: required,
      };
    }
  }

  return { allowed: true };
}

// ─── Tier upgrade ─────────────────────────────────────────────────────────────

/**
 * Upgrade an agent's compliance tier and provision matching budget limits.
 */
export async function upgradeTier(
  agentId: string,
  newTier: "kya" | "kyc",
  kyaToken?: string
): Promise<void> {
  const limits = TIER_LIMITS[newTier];

  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agentId },
      data: { complianceTier: newTier, ...(kyaToken && { kyaToken }) },
    }),
    prisma.agentBudget.upsert({
      where: { agentId },
      create: {
        agentId,
        dailyLimit: limits.dailySOL,
        weeklyLimit: limits.weeklySOL,
        monthlyLimit: limits.monthlySOL,
        singleTxLimit: limits.singleTxSOL,
      },
      update: {
        dailyLimit: limits.dailySOL,
        weeklyLimit: limits.weeklySOL,
        monthlyLimit: limits.monthlySOL,
        singleTxLimit: limits.singleTxSOL,
      },
    }),
    prisma.auditLog.create({
      data: {
        agentId,
        action: "tier_upgraded",
        detail: JSON.stringify({ newTier, at: new Date().toISOString() }),
      },
    }),
  ]);
}

// ─── Suspension ───────────────────────────────────────────────────────────────

export async function suspendAgent(agentId: string, reason: string): Promise<void> {
  await prisma.$transaction([
    prisma.agentBudget.update({
      where: { agentId },
      data: { suspended: true, suspendReason: reason },
    }),
    prisma.auditLog.create({
      data: {
        agentId,
        action: "agent_suspended",
        detail: JSON.stringify({ reason, at: new Date().toISOString() }),
      },
    }),
  ]);
}

export async function unsuspendAgent(agentId: string): Promise<void> {
  await prisma.$transaction([
    prisma.agentBudget.update({
      where: { agentId },
      data: { suspended: false, suspendReason: null },
    }),
    prisma.auditLog.create({
      data: {
        agentId,
        action: "agent_unsuspended",
        detail: JSON.stringify({ at: new Date().toISOString() }),
      },
    }),
  ]);
}

// ─── PSA Micro-payment exemption check ───────────────────────────────────────

const PSA_EXEMPT_JPY_THRESHOLD = 10_000; // ¥10,000
const SOL_TO_JPY_APPROX = 20_000;        // rough fallback rate

/**
 * Returns true if the transaction qualifies for PSA micro-payment exemption.
 * These transactions can be processed without full KYC for domestic agents.
 */
export function isPSAExempt(amount: number, currency: "SOL" | "USDC" | "JPYC"): boolean {
  if (currency === "JPYC") return amount < PSA_EXEMPT_JPY_THRESHOLD;
  if (currency === "SOL") return amount * SOL_TO_JPY_APPROX < PSA_EXEMPT_JPY_THRESHOLD;
  return false; // USDC: requires explicit conversion, not exempt by default
}
