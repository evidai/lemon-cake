/**
 * Deterministic SHA-256 hashing helpers for the incident contract.
 *
 * - `hashInput` accepts any JSON-serializable value, stably stringifies it
 *   (keys sorted), and returns a `sha256:<hex>` string.
 * - `hashResponse` accepts raw bytes (`Uint8Array`) or a string body and
 *   returns the same `sha256:<hex>` shape.
 *
 * The prefixed shape lets us rotate to a different algorithm later without
 * breaking downstream parsers.
 */

import { createHash } from "node:crypto";

/** Stable JSON stringify — sorts keys at every depth for hash stability. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify((v as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

export function hashInput(input: unknown): string {
  const serialized = stableStringify(input);
  const digest = createHash("sha256").update(serialized, "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function hashResponse(body: Uint8Array | string): string {
  const digest = createHash("sha256").update(body).digest("hex");
  return `sha256:${digest}`;
}
