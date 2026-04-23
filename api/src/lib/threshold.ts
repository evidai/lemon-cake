/**
 * Returns the set of thresholds (percentages) that were crossed when
 * `usedUsdc` went from `oldUsed` to `newUsed`, given a hard `limit`.
 *
 * Example: limit=100, thresholds=[50,80,95], oldUsed=45, newUsed=85
 *   → returns [50, 80] (both were just crossed by this charge)
 *
 * A threshold is "crossed" on the FIRST charge that pushes cumulative
 * usage past it. We never fire the same threshold twice (enforced at
 * the DB layer via a unique constraint).
 */

import type { Decimal } from "@prisma/client/runtime/library";

export function evaluateThresholdsCrossed(
  oldUsed: Decimal,
  newUsed: Decimal,
  limit: Decimal,
  thresholds: number[],
): number[] {
  if (limit.isZero() || limit.isNegative()) return [];
  const oldPct = oldUsed.div(limit).mul(100);
  const newPct = newUsed.div(limit).mul(100);
  return thresholds
    .filter((t) => oldPct.lessThan(t) && newPct.greaterThanOrEqualTo(t))
    .sort((a, b) => a - b);
}
