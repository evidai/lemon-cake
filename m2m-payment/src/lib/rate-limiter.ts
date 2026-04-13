/**
 * Rate Limiter — proprietary per-tier transaction throttle
 *
 * Enforces sliding-window velocity limits that differ by compliance tier.
 * Unverified agents (none) are tightly capped; KYC-verified agents receive
 * enterprise-grade throughput.
 *
 * Limits are tuned for the Japan PSA micro-payment exemption:
 *   - "none" tier: below ¥10k micro-payment zone
 *   - "kya"  tier: standard M2M agent tier
 *   - "kyc"  tier: institutional / high-frequency tier
 */

type Tier = "none" | "kya" | "kyc";

interface TierLimits {
  txPerMinute:    number;
  txPerHour:      number;
  maxAmountPerTx: number;   // in USDC units (treat JPYC × 0.0067 ≈ USD)
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  none: { txPerMinute:   2, txPerHour:    10, maxAmountPerTx:    10 },
  kya:  { txPerMinute:  30, txPerHour:   500, maxAmountPerTx:  1_000 },
  kyc:  { txPerMinute: 300, txPerHour: 5_000, maxAmountPerTx: 50_000 },
};

// Sliding-window store: agentId → sorted array of tx timestamps (epoch ms)
const windows = new Map<string, number[]>();

function getWindow(agentId: string): number[] {
  if (!windows.has(agentId)) windows.set(agentId, []);
  return windows.get(agentId)!;
}

function prune(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

/**
 * Check whether an agent is allowed to send a transaction.
 * Records the timestamp internally if allowed (do NOT double-call on success).
 */
export function checkRateLimit(
  agentId: string,
  tier:    Tier,
  amount:  number,
): { allowed: boolean; reason?: string } {
  const limits = TIER_LIMITS[tier];

  if (amount > limits.maxAmountPerTx) {
    return {
      allowed: false,
      reason: `Single-tx amount ${amount} exceeds tier '${tier}' cap of ${limits.maxAmountPerTx} USDC.`,
    };
  }

  const win = getWindow(agentId);

  const perMin = prune(win, 60_000);
  if (perMin.length >= limits.txPerMinute) {
    return {
      allowed: false,
      reason: `Rate limit: tier '${tier}' allows ${limits.txPerMinute} tx/min. Current: ${perMin.length}.`,
    };
  }

  const perHr = prune(win, 3_600_000);
  if (perHr.length >= limits.txPerHour) {
    return {
      allowed: false,
      reason: `Rate limit: tier '${tier}' allows ${limits.txPerHour} tx/hour. Current: ${perHr.length}.`,
    };
  }

  // Record and compact
  win.push(Date.now());
  windows.set(agentId, prune(win, 3_600_000));

  return { allowed: true };
}

/** Current window usage for an agent — used by dashboard/admin. */
export function getRateLimitUsage(agentId: string): { perMinute: number; perHour: number } {
  const win = getWindow(agentId);
  return {
    perMinute: prune(win, 60_000).length,
    perHour:   prune(win, 3_600_000).length,
  };
}

export function getTierLimits(tier: Tier): TierLimits {
  return TIER_LIMITS[tier];
}
