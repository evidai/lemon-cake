import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";

// Proxy の採算ガード相当
function shouldReject(pricePerCall: string, feeBps: number, minRevenue: string): boolean {
  const minRevenueD = new Decimal(minRevenue);
  if (minRevenueD.lte(0)) return false;
  const expected = new Decimal(pricePerCall).mul(feeBps).div(10000);
  return expected.lt(minRevenueD);
}

test("$0.005 × 250bps = $0.000125 passes $0.0001 floor", () => {
  assert.equal(shouldReject("0.005", 250, "0.0001"), false);
});

test("$0.005 × 100bps = $0.00005 fails $0.0001 floor", () => {
  assert.equal(shouldReject("0.005", 100, "0.0001"), true);
});

test("$0.00005 × 1000bps = $0.000005 fails $0.0001 floor (Serper original)", () => {
  assert.equal(shouldReject("0.00005", 1000, "0.0001"), true);
});

test("guard disabled when min=0 (default)", () => {
  assert.equal(shouldReject("0.0000001", 1, "0"), false);
});

test("$1 × 1bps = $0.0001 borderline (eq) — passes", () => {
  // not strictly less than, so passes
  assert.equal(shouldReject("1", 1, "0.0001"), false);
});

test("$1 × 0bps = $0 fails any positive floor", () => {
  assert.equal(shouldReject("1", 0, "0.0001"), true);
});
