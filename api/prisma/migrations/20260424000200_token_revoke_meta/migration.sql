-- Phase 4 — bulk revoke metadata
-- Record WHY a token was revoked and WHEN, so /charges/export and the
-- dashboard can show the narrative ("revoked by bulk-revoke @
-- 2026-04-24 for incident_tag=prompt-injection-42").

ALTER TABLE "tokens"
  ADD COLUMN "revokeReason" TEXT,
  ADD COLUMN "revokedAt"    TIMESTAMP(3);
