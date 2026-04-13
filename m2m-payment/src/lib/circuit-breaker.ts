/**
 * Circuit Breaker — proprietary safety layer
 *
 * Tracks success/failure rates per agent pair and opens the circuit
 * (blocks further transfers) when the failure count exceeds threshold.
 * Implements the standard three-state model: closed → open → half-open → closed.
 *
 * Motivation: prevents cascading failures and infinite payment-retry loops
 * between misbehaving or compromised agent pairs.
 */

interface CircuitState {
  failures:   number;
  successes:  number;  // counted only while half-open
  state:      "closed" | "open" | "half-open";
  openedAt?:  number;
}

/** Number of consecutive failures before the circuit opens. */
const FAILURE_THRESHOLD = 5;
/** Successes required in half-open state to close the circuit. */
const SUCCESS_THRESHOLD = 2;
/** Milliseconds in open state before transitioning to half-open. */
const RESET_TIMEOUT_MS  = 30_000;

// In-memory store — survives process lifetime; reset on restart.
const circuits = new Map<string, CircuitState>();

function key(fromId: string, toId: string): string {
  return `${fromId}::${toId}`;
}

function getOrCreate(fromId: string, toId: string): CircuitState {
  const k = key(fromId, toId);
  if (!circuits.has(k)) {
    circuits.set(k, { failures: 0, successes: 0, state: "closed" });
  }
  return circuits.get(k)!;
}

/**
 * Check whether a transfer between two agents is permitted.
 * Call this BEFORE executing the transfer.
 */
export function canTransact(
  fromId: string,
  toId:   string,
): { allowed: boolean; reason?: string } {
  const s = getOrCreate(fromId, toId);

  if (s.state === "open") {
    const elapsed = Date.now() - (s.openedAt ?? 0);
    if (elapsed >= RESET_TIMEOUT_MS) {
      s.state    = "half-open";
      s.successes = 0;
    } else {
      const remaining = Math.ceil((RESET_TIMEOUT_MS - elapsed) / 1000);
      return {
        allowed: false,
        reason: `Circuit open for ${fromId}→${toId}. Retry in ${remaining}s.`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Record a successful transfer for a pair.
 * Call this AFTER a confirmed on-chain settlement.
 */
export function recordSuccess(fromId: string, toId: string): void {
  const s = getOrCreate(fromId, toId);
  s.failures = 0;
  if (s.state === "half-open") {
    s.successes++;
    if (s.successes >= SUCCESS_THRESHOLD) {
      s.state = "closed";
    }
  }
}

/**
 * Record a failed transfer for a pair.
 * Call this when the on-chain transfer throws or returns an error.
 */
export function recordFailure(fromId: string, toId: string): void {
  const s = getOrCreate(fromId, toId);
  s.failures++;

  if (s.state === "closed" && s.failures >= FAILURE_THRESHOLD) {
    s.state    = "open";
    s.openedAt = Date.now();
  } else if (s.state === "half-open") {
    // Any failure in half-open re-opens the circuit immediately.
    s.state    = "open";
    s.openedAt = Date.now();
  }
}

/** Return the status of all non-healthy circuits (for admin/dashboard). */
export function getCircuitSummary(): Array<{
  pair:     string;
  state:    "closed" | "open" | "half-open";
  failures: number;
}> {
  return Array.from(circuits.entries())
    .filter(([, v]) => v.state !== "closed" || v.failures > 0)
    .map(([pair, v]) => ({ pair, state: v.state, failures: v.failures }))
    .sort((a, b) => b.failures - a.failures);
}

/** Number of currently open circuits. */
export function openCircuitCount(): number {
  return Array.from(circuits.values()).filter((v) => v.state === "open").length;
}
