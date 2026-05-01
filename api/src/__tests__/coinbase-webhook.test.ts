import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Coinbase Commerce webhook 署名検証ロジックを純粋関数として再実装してテスト
// (実装側 src/lib/coinbase-commerce.ts と同じアルゴリズム)
function verify(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

const SECRET = "test-secret-shhh";
const BODY = JSON.stringify({ event: { type: "charge:confirmed", data: { id: "abc" } } });
const VALID_SIG = crypto.createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");

test("valid signature passes", () => {
  assert.equal(verify(BODY, VALID_SIG, SECRET), true);
});

test("missing signature rejected", () => {
  assert.equal(verify(BODY, undefined, SECRET), false);
});

test("tampered body rejected", () => {
  const tamperedBody = BODY.replace("abc", "xyz");
  assert.equal(verify(tamperedBody, VALID_SIG, SECRET), false);
});

test("wrong secret rejected", () => {
  assert.equal(verify(BODY, VALID_SIG, "wrong-secret"), false);
});

test("invalid signature length rejected (no crash)", () => {
  assert.equal(verify(BODY, "abc", SECRET), false);
});
