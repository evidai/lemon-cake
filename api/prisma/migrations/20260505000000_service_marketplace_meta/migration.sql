-- Marketplace meta fields for Service
--
-- Adds seller-curated fields used by the Glama-style service listing:
-- description, longDescription, category, tags, iconEmoji, useCases,
-- samplePath, sampleMethod, sampleBody, documentationUrl.
-- All fields are optional / default to empty so legacy rows survive.
--
-- NOTE: Production deployment uses `prisma db push --accept-data-loss`
-- (see Dockerfile), so this file is descriptive only.

ALTER TABLE "services"
  ADD COLUMN "description"      TEXT,
  ADD COLUMN "longDescription"  TEXT,
  ADD COLUMN "category"         TEXT,
  ADD COLUMN "tags"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "iconEmoji"        TEXT,
  ADD COLUMN "useCases"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "samplePath"       TEXT,
  ADD COLUMN "sampleMethod"     TEXT,
  ADD COLUMN "sampleBody"       JSONB,
  ADD COLUMN "documentationUrl" TEXT;
