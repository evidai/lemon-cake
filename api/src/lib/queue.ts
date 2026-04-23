/**
 * BullMQ キュー定義
 *
 * USDC送金ジョブを非同期で処理するためのキュー。
 * Redis に接続し、ジョブの追加・処理を管理する。
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";

// ─── Redis 接続 ───────────────────────────────────────────────
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null, // BullMQ が必要とする設定
  });
}

// ─── ジョブペイロード型 ───────────────────────────────────────
export interface UsdcTransferJobData {
  chargeId:       string;
  buyerId:        string;
  serviceId:      string;
  amountUsdc:     string;  // Decimal string (e.g. "0.005000")
}

export const USDC_TRANSFER_QUEUE = "usdc-transfer";

// ─── キューインスタンス（API側で使用）────────────────────────
let _queue: Queue<UsdcTransferJobData> | null = null;

export function getUsdcTransferQueue(): Queue<UsdcTransferJobData> {
  if (!_queue) {
    _queue = new Queue<UsdcTransferJobData>(USDC_TRANSFER_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts:     3,
        backoff: {
          type:  "exponential",
          delay: 2_000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail:     { count: 500 },
      },
    });
  }
  return _queue;
}

// ─── Workflow ステップキュー ──────────────────────────────────
export interface WorkflowStepJobData {
  workflowId: string;
  step:       string;  // WorkflowState value
}

export const WORKFLOW_QUEUE = "workflow-step";

let _workflowQueue: Queue<WorkflowStepJobData> | null = null;

export function getWorkflowQueue(): Queue<WorkflowStepJobData> {
  if (!_workflowQueue) {
    _workflowQueue = new Queue<WorkflowStepJobData>(WORKFLOW_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff:  { type: "exponential", delay: 5_000 },
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    });
  }
  return _workflowQueue;
}

// ─── Spend-Threshold Webhook キュー（Phase 3） ──────────────────
export interface WebhookDeliveryJobData {
  deliveryId: string;     // SpendWebhookDelivery.id
}

export const WEBHOOK_DELIVERY_QUEUE = "webhook-delivery";

let _webhookQueue: Queue<WebhookDeliveryJobData> | null = null;

export function getWebhookDeliveryQueue(): Queue<WebhookDeliveryJobData> {
  if (!_webhookQueue) {
    _webhookQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_DELIVERY_QUEUE, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff:  { type: "exponential", delay: 3_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail:     { count: 500 },
      },
    });
  }
  return _webhookQueue;
}
