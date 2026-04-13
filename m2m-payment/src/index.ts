import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import prisma from "./lib/prisma";
import { attachKYA } from "./lib/kyapay";

import agentsRouter   from "./routes/agents";
import transferRouter from "./routes/transfer";
import statsRouter    from "./routes/stats";
import killswitchRouter from "./routes/killswitch";
import jpycRouter     from "./routes/jpyc";
import fraudRouter    from "./routes/fraud";
import adminRouter    from "./routes/admin";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Attach KYA identity if present (non-blocking)
app.use(attachKYA);

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/agents",      agentsRouter);
app.use("/api/transfer",    transferRouter);
app.use("/api/jpyc",        jpycRouter);
app.use("/api/stats",       statsRouter);
app.use("/api/killswitch",  killswitchRouter);
app.use("/api/fraud",       fraudRouter);
app.use("/api/admin",       adminRouter);    // admin: transactions, audit-log, system, circuit-breakers

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    features: ["KYAPay", "FraudDetection", "Reputation", "BudgetManagement", "JPYC"],
  });
});

// ── API surface overview ──────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    name: "AI Agent M2M Payment Infrastructure",
    version: "2.0.0",
    ecosystem: "Skyfire KYAPay Protocol",
    endpoints: {
      agents: {
        "POST /api/agents": "Create agent (auto-bootstraps reputation + budget)",
        "GET  /api/agents/:id": "Agent details with reputation and budget",
        "POST /api/agents/:id/kya": "Issue KYA token (upgrade to 'kya' tier)",
        "POST /api/agents/:id/kyc": "Upgrade to full KYC tier",
      },
      payments: {
        "POST /api/transfer": "SOL transfer with risk assessment",
        "POST /api/jpyc/transfer": "JPYC (ERC-20) transfer on Polygon",
        "GET  /api/jpyc/balance/:address": "JPYC balance for Ethereum address",
        "GET  /api/jpyc/rate": "Current JPYC/JPY exchange rate",
      },
      admin: {
        "GET  /api/fraud/flags": "List open fraud flags",
        "POST /api/fraud/flags/:id/resolve": "Resolve a fraud flag",
        "GET  /api/fraud/risk/:agentId": "Risk events for an agent",
        "POST /api/fraud/suspend/:agentId": "Manually suspend an agent",
        "POST /api/fraud/unsuspend/:agentId": "Unsuspend an agent",
        "GET  /api/stats": "System-wide transaction statistics",
        "POST /api/killswitch": "Halt / resume all transfers",
      },
    },
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[unhandled error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  await prisma.$connect();
  console.log("✓ Database connected");
  console.log("✓ KYAPay protocol active");
  console.log("✓ Fraud detection engine active");
  console.log("✓ JPYC payment layer active (simulation mode)");

  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`  SOLANA_RPC_URL = ${process.env.SOLANA_RPC_URL}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("\n✓ Database disconnected. Goodbye.");
  process.exit(0);
});
