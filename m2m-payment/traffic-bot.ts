/**
 * traffic-bot.ts
 * AI Agent M2M Payment — Traffic Simulator
 *
 * Usage:
 *   npx ts-node traffic-bot.ts [BASE_URL]
 *   npx ts-node traffic-bot.ts http://localhost:3000
 */

const BASE_URL = process.argv[2] ?? "http://localhost:3000";

// ── ANSI color helpers ────────────────────────────────────────────────────────
const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  cyan:    "\x1b[36m",
  magenta: "\x1b[35m",
  gray:    "\x1b[90m",
};

function colorize(color: keyof typeof c, text: string): string {
  return `${c[color]}${text}${c.reset}`;
}

function timestamp(): string {
  return colorize("gray", `[${new Date().toISOString()}]`);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Agent {
  id: string;
  publicKey: string;
}

interface TransferResult {
  txHash?: string;
  status?: string;
  error?: string;
  riskScore?: number;
  flagged?: boolean;
  code?: string;   // "AGENT_SUSPENDED"
  riskScore_?: number;
}

// ── State ─────────────────────────────────────────────────────────────────────
let isHalted = false;
let totalSent = 0;
let totalFailed = 0;
let startTime = Date.now();

// ── HTTP helpers ──────────────────────────────────────────────────────────────
async function post<T>(path: string, body?: object): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

async function get<T>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

// ── Agent bootstrap ───────────────────────────────────────────────────────────
async function createAgent(): Promise<Agent> {
  const { data } = await post<Agent>("/api/agents");
  return data;
}

async function bootstrapAgents(count = 10): Promise<Agent[]> {
  console.log(
    `\n${colorize("cyan", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`
  );
  console.log(
    `${colorize("bold", "  🤖 M2M Payment Traffic Bot")}  ${colorize("dim", `→ ${BASE_URL}`)}`
  );
  console.log(
    `${colorize("cyan", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}\n`
  );
  console.log(`${timestamp()} ${colorize("yellow", `⚡ Spawning ${count} agents...`)}`);

  const agents = await Promise.all(
    Array.from({ length: count }, () => createAgent())
  );

  agents.forEach((a, i) => {
    console.log(
      `  ${colorize("green", `✓`)} Agent ${String(i + 1).padStart(2, "0")}  ` +
      `${colorize("cyan", a.publicKey.slice(0, 8))}…${a.publicKey.slice(-6)}  ` +
      `${colorize("gray", a.id)}`
    );
  });

  console.log(
    `\n${timestamp()} ${colorize("green", `✅ ${count} agents ready. Entering fire loop...\n`)}`
  );
  return agents;
}

// ── Random helpers ────────────────────────────────────────────────────────────
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickTwo<T>(arr: T[]): [T, T] {
  const a = randInt(0, arr.length - 1);
  let b: number;
  do { b = randInt(0, arr.length - 1); } while (b === a);
  return [arr[a], arr[b]];
}

function shortKey(pubkey: string): string {
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-4)}`;
}

// ── Stats printer ─────────────────────────────────────────────────────────────
function printStats(): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const tps = (totalSent / parseFloat(elapsed)).toFixed(2);
  process.stdout.write(
    `\r${colorize("dim", `  📊 sent=${colorize("green", String(totalSent))}` +
    `  failed=${colorize("red", String(totalFailed))}` +
    `  avg_tps=${colorize("yellow", tps + "/s")}` +
    `  elapsed=${elapsed}s     `)}`
  );
}

// ── Single transfer ───────────────────────────────────────────────────────────
async function fireTransfer(agents: Agent[]): Promise<void> {
  const [from, to] = pickTwo(agents);

  try {
    const { status, data } = await post<TransferResult>("/api/transfer", {
      fromAgentId: from.id,
      toAgentId: to.id,
    });

    if (status === 403) {
      totalFailed++;
      process.stdout.write("\n");

      // Distinguish between killswitch halt, fraud block, and agent suspension
      if (data.error === "System is halted. Transfers are disabled.") {
        if (!isHalted) {
          isHalted = true;
          console.log(
            `\n${colorize("red", "🚨 ███ SYSTEM HALTED ███")}  ` +
            `${colorize("yellow", "Kill switch activated. Pausing transfers...")}\n`
          );
        }
      } else if (data.error === "Transfer blocked by fraud detection") {
        console.log(
          `${timestamp()} ${colorize("red", "🛡 FRAUD BLOCK")} ` +
          `${colorize("cyan", shortKey(from.publicKey))} ` +
          `${colorize("magenta", "->")} ` +
          `${colorize("cyan", shortKey(to.publicKey))}: ` +
          `score=${colorize("red", String(data.riskScore ?? "?"))}  ` +
          `${colorize("gray", data.error ?? "")}`
        );
      } else if (data.code === "AGENT_SUSPENDED") {
        console.log(
          `${timestamp()} ${colorize("yellow", "⛔ SUSPENDED")} ` +
          `${colorize("cyan", shortKey(from.publicKey))}: ` +
          `${colorize("gray", data.error ?? "Agent suspended")}`
        );
      } else {
        // Compliance or other 403
        console.log(
          `${timestamp()} ${colorize("yellow", "⚠ BLOCKED")} ` +
          `${colorize("cyan", shortKey(from.publicKey))} ` +
          `${colorize("magenta", "->")} ` +
          `${colorize("cyan", shortKey(to.publicKey))}: ` +
          `${colorize("gray", data.error ?? "Blocked")}`
        );
      }
      return;
    }

    // If we were halted but got a non-403, system resumed
    if (isHalted) {
      isHalted = false;
      process.stdout.write("\n");
      console.log(
        `${timestamp()} ${colorize("green", "✅ System resumed. Transfers re-enabled.")}\n`
      );
    }

    if (status === 200 && data.txHash) {
      totalSent++;
      const riskTag = data.riskScore !== undefined
        ? ` ${colorize(data.riskScore >= 50 ? "yellow" : "gray", `risk=${data.riskScore.toFixed(0)}`)}`
        : "";
      const flagTag = data.flagged ? colorize("yellow", " ⚑flagged") : "";
      process.stdout.write("\n");
      console.log(
        `${timestamp()} ${colorize("bold", "🤖")} ` +
        `${colorize("cyan", shortKey(from.publicKey))} ` +
        `${colorize("magenta", "->")} ` +
        `${colorize("cyan", shortKey(to.publicKey))}: ` +
        `${colorize("green", "Tx Sent")} ` +
        `${colorize("yellow", `[${data.txHash.slice(0, 20)}…]`)}` +
        `${riskTag}${flagTag}`
      );
    } else {
      totalFailed++;
      process.stdout.write("\n");
      console.log(
        `${timestamp()} ${colorize("red", "✗")} ` +
        `${colorize("cyan", shortKey(from.publicKey))} ` +
        `${colorize("magenta", "->")} ` +
        `${colorize("cyan", shortKey(to.publicKey))}: ` +
        `${colorize("red", `FAILED (${data.error ?? data.status ?? "unknown"})`)}`
      );
    }
  } catch (err) {
    totalFailed++;
    process.stdout.write("\n");
    console.log(
      `${timestamp()} ${colorize("red", `⚠ Network error: ${String(err)}`)}`
    );
  }

  printStats();
}

// ── Halt-check loop (runs independently) ─────────────────────────────────────
async function haltCheckLoop(): Promise<void> {
  while (true) {
    await sleep(3000);
    if (!isHalted) continue;

    try {
      const { data } = await get<{ isHalted: boolean }>("/api/killswitch");
      if (!data.isHalted) {
        isHalted = false;
        process.stdout.write("\n");
        console.log(
          `${timestamp()} ${colorize("green", "✅ Kill switch cleared. Resuming...")}\n`
        );
      } else {
        console.log(
          `${colorize("red", "🚨 Still halted.")} ` +
          `${colorize("gray", "Retrying in 3s...")}`
        );
      }
    } catch {
      // server unreachable — keep waiting
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const agents = await bootstrapAgents(10);
  startTime = Date.now();

  // Run halt-check independently in background
  haltCheckLoop().catch(() => {});

  // Fire loop
  while (true) {
    if (isHalted) {
      await sleep(500);
      continue;
    }

    // 5〜10 concurrent requests per batch
    const concurrency = randInt(5, 10);
    const batch = Array.from({ length: concurrency }, () => fireTransfer(agents));
    await Promise.all(batch);

    // Small gap to spread load naturally (50〜200ms between batches)
    await sleep(randInt(50, 200));
  }
}

// ── Graceful exit ─────────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  process.stdout.write("\n");
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(
    `\n${colorize("cyan", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`
  );
  console.log(colorize("bold", "  📊 Final Stats"));
  console.log(`  Sent   : ${colorize("green", String(totalSent))}`);
  console.log(`  Failed : ${colorize("red", String(totalFailed))}`);
  console.log(`  Elapsed: ${elapsed}s`);
  console.log(
    `  Avg TPS: ${colorize("yellow", (totalSent / parseFloat(elapsed)).toFixed(2) + "/s")}`
  );
  console.log(
    `${colorize("cyan", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}\n`
  );
  process.exit(0);
});

main().catch((err) => {
  console.error(colorize("red", `Fatal: ${err}`));
  process.exit(1);
});
