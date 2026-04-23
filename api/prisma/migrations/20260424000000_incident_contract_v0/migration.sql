-- Phase 1 — Incident Contract v0 schema groundwork
-- Adds workflow_id / agent_id / request_id / hashes / reconcile / ownership fields
-- to Token and Charge, plus a new ReconcileStatus enum. All columns are nullable
-- (or default-bearing) so this is a safe forward-only migration with no backfill.

-- ─── New enum ────────────────────────────────────────────────────────────
CREATE TYPE "ReconcileStatus" AS ENUM ('OPEN', 'ANNOTATED', 'CLOSED', 'DISPUTED');

-- ─── Token: intent + recovery hint fields ───────────────────────────────
ALTER TABLE "tokens"
  ADD COLUMN "workflowId"        TEXT,
  ADD COLUMN "agentId"           TEXT,
  ADD COLUMN "allowedUpstreams"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "retryPolicy"       JSONB,
  ADD COLUMN "replaySafe"        BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "tokens_workflowId_idx" ON "tokens"("workflowId");

-- ─── Charge: full incident contract persistence ─────────────────────────
ALTER TABLE "charges"
  ADD COLUMN "requestId"         TEXT,
  ADD COLUMN "workflowId"        TEXT,
  ADD COLUMN "agentId"           TEXT,
  ADD COLUMN "inputHash"         TEXT,
  ADD COLUMN "responseHash"      TEXT,
  ADD COLUMN "providerStatus"    INTEGER,
  ADD COLUMN "incidentTag"       TEXT,
  ADD COLUMN "revokeReason"      TEXT,
  ADD COLUMN "reconcileStatus"   "ReconcileStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "ownerQueue"        TEXT,
  ADD COLUMN "ownerReason"       TEXT,
  ADD COLUMN "escalatedAt"       TIMESTAMP(3),
  ADD COLUMN "annotations"       JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN "closedAt"          TIMESTAMP(3),
  ADD COLUMN "incidentContract"  JSONB,
  ADD COLUMN "incidentSignature" TEXT;

CREATE INDEX "charges_workflowId_idx"   ON "charges"("workflowId");
CREATE INDEX "charges_incidentTag_idx"  ON "charges"("incidentTag");
CREATE INDEX "charges_requestId_idx"    ON "charges"("requestId");
