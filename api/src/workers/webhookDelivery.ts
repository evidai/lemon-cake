/**
 * Spend-Threshold Webhook Delivery Worker (Phase 3)
 *
 * Consumes WEBHOOK_DELIVERY_QUEUE jobs. Each job carries a deliveryId
 * referencing a `SpendWebhookDelivery` row that was inserted (atomically,
 * via a unique DB constraint) when a charge pushed the token's usedUsdc
 * past a configured threshold.
 *
 * The worker POSTs a signed JSON payload to the buyer's webhook URL:
 *
 *   Headers:
 *     Content-Type:          application/json
 *     X-Kyapay-Delivery-Id:  <deliveryId>
 *     X-Kyapay-Signature:    sha256=<hex>  (HMAC-SHA256 of raw body)
 *     X-Kyapay-Timestamp:    <unix seconds>
 *
 *   Body:
 *     { deliveryId, webhookId, tokenId, threshold, chargeId,
 *       usedUsdc, limitUsdc, percent, emittedAt }
 *
 * 2xx response → DELIVERED. Anything else throws and BullMQ applies
 * exponential backoff (5 attempts). After final failure the row is
 * marked FAILED with the last error message.
 */

import { Worker, type Job } from "bullmq";
import { createHmac } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  createRedisConnection,
  WEBHOOK_DELIVERY_QUEUE,
  type WebhookDeliveryJobData,
} from "../lib/queue.js";

export function startWebhookDeliveryWorker(): Worker {
  const worker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_DELIVERY_QUEUE,
    processJob,
    {
      connection:  createRedisConnection(),
      concurrency: 10,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[WebhookWorker] ✅ delivered ${job.data.deliveryId}`);
  });

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[WebhookWorker] ❌ ${job.data.deliveryId}: ${err.message}`);
    // Persist last error on every attempt; final failure sets FAILED.
    const final = job.attemptsMade >= (job.opts.attempts ?? 5);
    try {
      await prisma.spendWebhookDelivery.update({
        where: { id: job.data.deliveryId },
        data:  {
          attempts:  job.attemptsMade,
          lastError: err.message.slice(0, 500),
          ...(final ? { status: "FAILED" as const } : {}),
        },
      });
    } catch (persistErr) {
      console.error("[WebhookWorker] failed to persist error:", persistErr);
    }
  });

  worker.on("error", (err) => {
    console.error("[WebhookWorker] Worker error:", err);
  });

  console.log("[WebhookWorker] 🔧 webhookDeliveryWorker started");
  return worker;
}

async function processJob(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const { deliveryId } = job.data;

  const delivery = await prisma.spendWebhookDelivery.findUnique({
    where:   { id: deliveryId },
    include: { webhook: true },
  });
  if (!delivery) throw new Error(`Delivery not found: ${deliveryId}`);
  if (delivery.status === "DELIVERED") return; // already done
  if (!delivery.webhook.active) {
    // Buyer disabled the hook mid-flight — mark failed and stop retrying.
    await prisma.spendWebhookDelivery.update({
      where: { id: deliveryId },
      data:  { status: "FAILED", lastError: "webhook disabled" },
    });
    return;
  }

  // Pull token context for the payload.
  const token = await prisma.token.findUnique({ where: { id: delivery.tokenId } });
  if (!token) throw new Error(`Token not found: ${delivery.tokenId}`);

  const usedUsdc  = token.usedUsdc.toFixed(6);
  const limitUsdc = token.limitUsdc.toFixed(6);
  const percent   = token.limitUsdc.isZero()
    ? 0
    : Number(token.usedUsdc.div(token.limitUsdc).mul(100).toFixed(2));

  const payload = {
    deliveryId,
    webhookId: delivery.webhookId,
    tokenId:   delivery.tokenId,
    threshold: delivery.threshold,
    chargeId:  delivery.chargeId,
    usedUsdc,
    limitUsdc,
    percent,
    emittedAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", delivery.webhook.secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  // 10s timeout — buyer endpoints that stall should fail fast and retry.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res: Response;
  try {
    res = await fetch(delivery.webhook.url, {
      method:  "POST",
      headers: {
        "Content-Type":         "application/json",
        "X-Kyapay-Delivery-Id": deliveryId,
        "X-Kyapay-Signature":   `sha256=${signature}`,
        "X-Kyapay-Timestamp":   timestamp,
      },
      body:   rawBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  await prisma.spendWebhookDelivery.update({
    where: { id: deliveryId },
    data:  {
      status:      "DELIVERED",
      attempts:    job.attemptsMade + 1,
      deliveredAt: new Date(),
      lastError:   null,
    },
  });
}
