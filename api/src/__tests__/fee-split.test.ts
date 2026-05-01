import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/library";

// Worker の resolveFeeBps 相当
function resolveFeeBps(serviceFeeBps: number | null | undefined, envBpsOverride?: string): number {
  if (serviceFeeBps != null && serviceFeeBps >= 0 && serviceFeeBps <= 10000) return serviceFeeBps;
  const envBps = parseInt(envBpsOverride ?? process.env.PLATFORM_FEE_BPS ?? "1000", 10);
  if (envBps >= 0 && envBps <= 10000) return envBps;
  return 1000;
}

function splitCharge(amountUsdc: string, feeBps: number) {
  const total = new Decimal(amountUsdc);
  const platformFee = total.mul(feeBps).div(10000).toDecimalPlaces(18, Decimal.ROUND_DOWN);
  const providerAmt = total.sub(platformFee);
  return { total, platformFee, providerAmt };
}

test("resolveFeeBps prefers Service.platformFeeBps", () => {
  assert.equal(resolveFeeBps(500), 500);
  assert.equal(resolveFeeBps(0), 0);
});

test("resolveFeeBps falls back to env then default", () => {
  assert.equal(resolveFeeBps(null, "250"), 250);
  assert.equal(resolveFeeBps(undefined, undefined), parseInt(process.env.PLATFORM_FEE_BPS ?? "1000"));
});

test("resolveFeeBps rejects invalid bps", () => {
  // > 10000 falls through to env/default
  assert.equal(resolveFeeBps(20000, "500"), 500);
  assert.equal(resolveFeeBps(-1, "500"), 500);
});

test("split at 10% (1000 bps)", () => {
  const { platformFee, providerAmt } = splitCharge("0.005", 1000);
  assert.equal(platformFee.toFixed(6), "0.000500");
  assert.equal(providerAmt.toFixed(6), "0.004500");
});

test("split at 2.5% (250 bps)", () => {
  const { platformFee, providerAmt } = splitCharge("0.005", 250);
  assert.equal(platformFee.toFixed(6), "0.000125");
  assert.equal(providerAmt.toFixed(6), "0.004875");
});

test("split sum equals total (no rounding loss)", () => {
  const { total, platformFee, providerAmt } = splitCharge("0.123456", 333);
  assert.equal(platformFee.add(providerAmt).toString(), total.toString());
});

test("split at 0 bps (free) returns 100% to provider", () => {
  const { platformFee, providerAmt } = splitCharge("0.005", 0);
  assert.equal(platformFee.toString(), "0");
  assert.equal(providerAmt.toFixed(6), "0.005000");
});

test("split at 10000 bps (100% fee, theoretical) returns 0 to provider", () => {
  const { platformFee, providerAmt } = splitCharge("0.005", 10000);
  assert.equal(platformFee.toFixed(6), "0.005000");
  assert.equal(providerAmt.toFixed(6), "0.000000");
});
