-- Phase 3 — Spend-threshold webhooks
-- Buyer-configured webhooks that fire when a Pay Token's usedUsdc crosses
-- the configured percentage thresholds (e.g. [50, 80, 95]). Enables
-- graceful degrade before the 100% hard revoke.

CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "spend_webhooks" (
  "id"          TEXT NOT NULL,
  "buyerId"     TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "thresholds"  INTEGER[] NOT NULL DEFAULT ARRAY[50, 80, 95]::INTEGER[],
  "secret"      TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spend_webhooks_pkey"     PRIMARY KEY ("id"),
  CONSTRAINT "spend_webhooks_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "spend_webhooks_buyerId_idx" ON "spend_webhooks"("buyerId");

CREATE TABLE "spend_webhook_deliveries" (
  "id"           TEXT NOT NULL,
  "webhookId"    TEXT NOT NULL,
  "tokenId"      TEXT NOT NULL,
  "threshold"    INTEGER NOT NULL,
  "chargeId"     TEXT,
  "status"       "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "lastError"    TEXT,
  "deliveredAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spend_webhook_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "spend_webhook_deliveries_webhookId_fkey"
    FOREIGN KEY ("webhookId") REFERENCES "spend_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Guarantee each (webhook, token, threshold) tuple fires at most once —
-- concurrent charges compete on this unique constraint.
CREATE UNIQUE INDEX "spend_webhook_deliveries_webhook_token_threshold_key"
  ON "spend_webhook_deliveries"("webhookId", "tokenId", "threshold");

CREATE INDEX "spend_webhook_deliveries_status_idx" ON "spend_webhook_deliveries"("status");
