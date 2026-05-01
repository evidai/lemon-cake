/**
 * KYAPay API — エントリーポイント
 *
 * Hono + @hono/zod-openapi + @hono/swagger-ui
 *
 * ローカル起動: npm run dev
 * Swagger UI:   http://localhost:3002/docs
 * OpenAPI JSON: http://localhost:3002/openapi.json
 */

import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { HTTPException } from "hono/http-exception";

import { loadSecretsFromGCP } from "./lib/secrets.js";
import { tokensRouter }    from "./routes/tokens.js";
import { chargeRouter }    from "./routes/charge.js";
import { quoteRouter }     from "./routes/quote.js";
import { spendWebhooksRouter } from "./routes/spend-webhooks.js";
import { chargesAdminRouter } from "./routes/charges-admin.js";
import { buyersRouter }    from "./routes/buyers.js";
import { servicesRouter }  from "./routes/services.js";
import { providersRouter } from "./routes/providers.js";
import { authRouter }      from "./routes/auth.js";
import { jpycRouter }      from "./routes/jpyc.js";
import { taxRouter }       from "./routes/tax.js";
import { stripeRouter }    from "./routes/stripe.js";
import { freeeRouter }     from "./routes/freee.js";
import { proxyRouter }       from "./routes/proxy.js";
import { accountingRouter }  from "./routes/accounting.js";
import { workflowRouter }           from "./routes/workflows.js";
import { cloudsignWebhookRouter }   from "./routes/webhooks/cloudsign.js";
import { aftershipWebhookRouter }   from "./routes/webhooks/aftership.js";
import { githubWebhookRouter }      from "./routes/webhooks/github.js";
import { kybRouter }                from "./routes/kyb.js";
import { telemetryRouter }          from "./routes/telemetry.js";
import { adminRouter }              from "./routes/admin.js";
import { adminRevenueRouter }       from "./routes/admin-revenue.js";
import { coinbaseRouter }           from "./routes/coinbase.js";
import { startUsdcTransferWorker, handleFailedJob } from "./workers/usdcTransfer.js";
import { startProviderPayoutCron, stopProviderPayoutCron } from "./workers/providerPayout.js";
import { startServiceHealthCron, stopServiceHealthCron } from "./workers/serviceHealth.js";
import { startWorkflowWorker }      from "./workers/workflowStep.js";
import { startWebhookDeliveryWorker } from "./workers/webhookDelivery.js";

// ─── アプリ初期化 ────────────────────────────────────────────
const app = new OpenAPIHono();

// ─── グローバルミドルウェア ──────────────────────────────────
app.use("*", logger());
app.use("*", prettyJSON());
const isDev = process.env.NODE_ENV !== "production";

app.use(
  "*",
  cors({
    origin: (origin) => {
      // 開発環境のみ localhost を全ポート許可
      if (isDev && (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
        return origin ?? "*";
      }
      // 本番ドメインのみ許可（ALLOWED_ORIGINS 環境変数で上書き可能）
      const allowed = (process.env.ALLOWED_ORIGINS ?? "https://lemoncake.xyz,https://www.lemoncake.xyz").split(",").map(s => s.trim());
      if (allowed.includes(origin ?? "")) return origin!;
      return null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

// ─── ルーティング ────────────────────────────────────────────
app.route("/api/auth",      authRouter);
app.route("/api/tokens",    tokensRouter);
app.route("/api/charges",   chargeRouter);
app.route("/api/charges",   chargesAdminRouter);
app.route("/api/quote",     quoteRouter);
app.route("/api/spend-webhooks", spendWebhooksRouter);
app.route("/api/buyers",    buyersRouter);
app.route("/api/services",  servicesRouter);
app.route("/api/providers", providersRouter);
app.route("/api/jpyc",      jpycRouter);
app.route("/api/tax",       taxRouter);
app.route("/api/stripe",    stripeRouter);
app.route("/api/freee",     freeeRouter);
app.route("/api/proxy",      proxyRouter);
app.route("/api/accounting", accountingRouter);
app.route("/api/workflows",              workflowRouter);
app.route("/api/webhooks/cloudsign",     cloudsignWebhookRouter);
app.route("/api/webhooks/aftership",     aftershipWebhookRouter);
app.route("/api/webhooks/github",        githubWebhookRouter);
app.route("/api/kyb",                    kybRouter);
app.route("/api/telemetry",              telemetryRouter);
app.route("/api/admin",                  adminRouter);
app.route("/api/admin/revenue",          adminRevenueRouter);
app.route("/api/coinbase",               coinbaseRouter);

// ─── OpenAPI ドキュメント定義 ────────────────────────────────
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title:   "KYAPay API",
    version: "0.1.0",
    description: [
      "AIエージェント間のM2M決済インフラ「KYAPay」のバックエンドAPI。",
      "",
      "## 認証",
      "- **Pay Token (JWT):** エージェントが `POST /api/charge` を呼ぶ際にリクエストボディで渡す",
      "- **Admin JWT:** 管理者エンドポイント（Phase 2）で `Authorization: Bearer <token>` ヘッダーを使用",
      "",
      "## 冪等性",
      "`POST /api/charge` には `Idempotency-Key` ヘッダーが必須。",
      "同一キーの重複リクエストは既存レコードを返し、二重課金を防ぐ。",
    ].join("\n"),
    contact: { name: "KYAPay Team", email: "contact@kyapay.io" },
  },
  tags: [
    { name: "Buyers",    description: "購入者管理" },
    { name: "Tokens",    description: "Pay Token 発行・管理" },
    { name: "Charges",   description: "課金トランザクション" },
    { name: "Providers", description: "サービスプロバイダー管理" },
    { name: "Services",  description: "サービス登録・審査" },
    { name: "JPYC",      description: "JPYCステーブルコイン残高チャージ" },
    { name: "Tax",       description: "国税庁API照合・源泉徴収判定（JP Compliance）" },
    { name: "Stripe",    description: "銀行振込チャージ (Customer Balance)" },
  ],
});

// ─── Swagger UI ──────────────────────────────────────────────
app.get(
  "/docs",
  swaggerUI({ url: "/openapi.json" }),
);

// ─── ヘルスチェック ──────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ status: "ok", version: "0.1.0", ts: new Date().toISOString() }),
);

// ─── グローバルエラーハンドラー ──────────────────────────────
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("[Unhandled Error]", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

// ─── メイン起動関数 ──────────────────────────────────────────
async function main(): Promise<void> {
  // 本番 (NODE_ENV=production) のみ GCP Secret Manager からシークレットを取得
  // 開発環境は .env をそのまま使用（何もしない）
  await loadSecretsFromGCP();

  const PORT = parseInt(process.env.PORT ?? "3002", 10);

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`\n🚀 KYAPay API started`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Docs:    http://localhost:${PORT}/docs`);
    console.log(`   OpenAPI: http://localhost:${PORT}/openapi.json\n`);
  });

  // ─── BullMQ ワーカー起動 ───────────────────────────────────
  // SKIP_WORKER=true でスキップ可能（テスト・マイグレーション実行時等）
  if (process.env.SKIP_WORKER !== "true") {
    const workflowWorker = startWorkflowWorker();
    const worker = startUsdcTransferWorker();
    const webhookWorker = startWebhookDeliveryWorker();

    // 最終失敗時の補償処理（リトライ上限を超えた場合）
    worker.on("failed", async (job, err) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        await handleFailedJob(job, err);
      }
    });

    // ─── HOT_WALLET 自動補充 cron (15分間隔) ──────────────────
    // バッチ送金モードでは HOT 消費が provider payout と admin withdraw のみ
    const REFILL_INTERVAL_MS = 15 * 60 * 1000;
    const refillTimer = setInterval(async () => {
      try {
        const { refillHotWalletIfNeeded } = await import("./lib/treasury.js");
        const result = await refillHotWalletIfNeeded();
        if (result.refilled) console.log("[CronRefill] ✅", result);
      } catch (e) {
        console.error("[CronRefill] error:", e);
      }
    }, REFILL_INTERVAL_MS);
    refillTimer.unref();

    // ─── Provider 日次バッチ送金 cron ────────────────────────
    startProviderPayoutCron();

    // ─── Service health 1時間 cron ───────────────────────────
    startServiceHealthCron();

    // グレースフルシャットダウン
    const shutdown = async (): Promise<void> => {
      console.log("\n[Shutdown] Closing workers...");
      clearInterval(refillTimer);
      stopProviderPayoutCron();
      stopServiceHealthCron();
      await Promise.allSettled([worker.close(), workflowWorker.close(), webhookWorker.close()]);
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT",  shutdown);
  }
}

main().catch((err) => {
  console.error("[Fatal] Server failed to start:", err);
  process.exit(1);
});
