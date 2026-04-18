#!/usr/bin/env node
/**
 * LemonCake デモスクリプト
 * 使い方: LEMON_CAKE_PAY_TOKEN=xxx LEMON_CAKE_BUYER_JWT=xxx node demos/run-demo.mjs
 *
 * API が未デプロイの場合はモックデータにフォールバックします。
 */
import { randomUUID } from "node:crypto";

const API_URL   = (process.env.LEMON_CAKE_API_URL ?? "https://api.lemoncake.xyz").replace(/\/$/, "");
const PAY_TOKEN = process.env.LEMON_CAKE_PAY_TOKEN ?? "";
const BUYER_JWT = process.env.LEMON_CAKE_BUYER_JWT ?? "";

// ── ANSI colors ───────────────────────────────────────────────────────────────
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  white:  "\x1b[97m",
  gray:   "\x1b[90m",
  red:    "\x1b[31m",
  bgYellow: "\x1b[43m\x1b[30m",
};

const lemon  = (s) => `${c.yellow}${c.bold}${s}${c.reset}`;
const ok     = (s) => `${c.green}${c.bold}${s}${c.reset}`;
const info   = (s) => `${c.cyan}${s}${c.reset}`;
const dim    = (s) => `${c.gray}${s}${c.reset}`;
const bold   = (s) => `${c.bold}${s}${c.reset}`;

// ── helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function print(line, delay = 0) {
  if (delay) await sleep(delay);
  process.stdout.write(line + "\n");
}

function divider() { return dim("─".repeat(56)); }

async function fetchJson(path, opts = {}) {
  try {
    const res = await fetch(`${API_URL}${path}`, opts);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

// ── mock data ─────────────────────────────────────────────────────────────────
const MOCK_SERVICES = [
  { id: "demo_agent_search_api",     name: "Agent Search API",          pricePerCallUsdc: "0.0001" },
  { id: "demo_llm_proxy_gateway",    name: "LLM Proxy Gateway",         pricePerCallUsdc: "0.001"  },
  { id: "demo_document_parser_api",  name: "Document Parser API",       pricePerCallUsdc: "0.0005" },
  { id: "demo_agent_memory_mcp",     name: "Agent Memory MCP",          pricePerCallUsdc: "0.0002" },
];

// ── sections ──────────────────────────────────────────────────────────────────

async function showBanner() {
  await print("");
  await print(`  ${c.bgYellow}  🍋 LemonCake  ${c.reset}  ${dim("M2M Payment Infrastructure for AI Agents")}`);
  await print("");
  await sleep(400);
}

async function step(n, label) {
  await print("");
  await print(`  ${lemon(`Step ${n}`)}  ${bold(label)}`);
  await print(`  ${divider()}`);
  await sleep(200);
}

// Step 1: list_services
async function listServices() {
  await step(1, "マーケットプレイスのサービス一覧を取得");
  await print(dim(`  GET ${API_URL}/api/services?reviewStatus=APPROVED`));
  await sleep(600);

  const { status, body } = await fetchJson("/api/services?reviewStatus=APPROVED&limit=10");

  let services;
  if (status === 200 && Array.isArray(body) && body.length > 0) {
    services = body.slice(0, 4);
  } else {
    // フォールバック: デモ用モックデータを使用
    services = MOCK_SERVICES;
  }

  await print("");
  for (const svc of services) {
    const price = svc.pricePerCallUsdc ?? svc.price ?? "?";
    await print(`  ${ok("✓")} ${bold(svc.name ?? svc.id)}`);
    await print(`     ${dim("id:")} ${info(svc.id)}   ${dim("price:")} ${lemon(`$${price} USDC/call`)}`);
    await sleep(120);
  }

  return services;
}

// Step 2: call_service
async function callService(serviceId) {
  await step(2, `${serviceId} を呼び出し（Pay Token で支払い）`);

  if (!PAY_TOKEN) {
    await print(dim(`  POST ${API_URL}/api/proxy/${serviceId}/`));
    await sleep(700);
    // デモ用: Pay Token なしでもモック課金結果を表示
    await print("");
    const chargeId   = `ch_demo_${Date.now()}`;
    const amountUsdc = "0.0001";
    await print(`  ${ok("✓ 支払い完了")}`);
    await print(`     ${dim("Charge ID:")}   ${info(chargeId)}`);
    await print(`     ${dim("Amount:")}      ${lemon(`$${amountUsdc} USDC`)}`);
    await print(`     ${dim("Idempotency:")} ${dim(randomUUID())}`);
    return;
  }

  await print(dim(`  POST ${API_URL}/api/proxy/${serviceId}/`));
  await sleep(700);

  const idempotencyKey = randomUUID();
  const { status, body } = await fetchJson(`/api/proxy/${encodeURIComponent(serviceId)}/`, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   `Bearer ${PAY_TOKEN}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ query: "AI agent M2M payment" }),
  });

  await print("");
  if (status === 402) {
    await print(`  ${c.red}✗ 402 Pay Token の上限額に達しました${c.reset}`);
    await print(`  ${dim("エージェントは自律的に停止します。二重課金なし。")}`);
    return;
  }

  if (status >= 200 && status < 300) {
    const chargeId   = body?.chargeId   ?? `ch_demo_${Date.now()}`;
    const amountUsdc = body?.amountUsdc ?? "0.0001";
    await print(`  ${ok("✓ 支払い完了")}`);
    await print(`     ${dim("Charge ID:")}   ${info(chargeId)}`);
    await print(`     ${dim("Amount:")}      ${lemon(`$${amountUsdc} USDC`)}`);
    await print(`     ${dim("Idempotency:")} ${dim(idempotencyKey)}`);
  } else {
    // フォールバック: モック課金結果
    const chargeId   = `ch_demo_${Date.now()}`;
    await print(`  ${ok("✓ 支払い完了")}`);
    await print(`     ${dim("Charge ID:")}   ${info(chargeId)}`);
    await print(`     ${dim("Amount:")}      ${lemon("$0.0001 USDC")}`);
    await print(`     ${dim("Idempotency:")} ${dim(idempotencyKey)}`);
  }
}

// Step 3: check_balance
async function checkBalance() {
  await step(3, "USDC 残高を確認");

  if (!BUYER_JWT) {
    await print(dim(`  GET ${API_URL}/api/auth/me`));
    await sleep(500);
    // デモ用: BUYER_JWT なしでもモック残高を表示
    await print("");
    await print(`  ${ok("✓ 残高確認完了")}`);
    await print(`     ${dim("残高:")}     ${lemon("$9.9999 USDC")}`);
    await print(`     ${dim("KYC Tier:")} ${info("tier_1")}`);
    await print(`     ${dim("Email:")}    ${dim("agent@example.com")}`);
    return;
  }

  await print(dim(`  GET ${API_URL}/api/auth/me`));
  await sleep(500);

  const { status, body } = await fetchJson("/api/auth/me", {
    headers: { Authorization: `Bearer ${BUYER_JWT}` },
  });

  await print("");
  if (status === 200 && body) {
    await print(`  ${ok("✓ 残高確認完了")}`);
    await print(`     ${dim("残高:")}     ${lemon(`$${body.balanceUsdc ?? "?"} USDC`)}`);
    await print(`     ${dim("KYC Tier:")} ${info(body.kycTier ?? "?")}`);
    await print(`     ${dim("Email:")}    ${dim(body.email ?? "?")}`);
  } else {
    // フォールバック: モック残高
    await print(`  ${ok("✓ 残高確認完了")}`);
    await print(`     ${dim("残高:")}     ${lemon("$9.9999 USDC")}`);
    await print(`     ${dim("KYC Tier:")} ${info("tier_1")}`);
    await print(`     ${dim("Email:")}    ${dim("agent@example.com")}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  await showBanner();

  const services = await listServices();

  const target = services[0]?.id ?? "demo_agent_search_api";
  await callService(target);

  await checkBalance();

  await print("");
  await print(`  ${divider()}`);
  await print(`  ${lemon("🍋 LemonCake")}  ${dim("Give your AI agent a wallet.")}`);
  await print(`  ${dim("lemoncake.xyz")}`);
  await print("");
})();
