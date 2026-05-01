-- Multi-service Pay Token support
--
-- 1. Adds TokenScope enum (SINGLE | ALL)
-- 2. Adds tokens.scope column with default SINGLE (existing rows stay SINGLE)
-- 3. Drops the NOT NULL constraint on tokens.serviceId so ALL-scope tokens
--    can be issued without binding to one service.
--
-- Backward compatibility: existing tokens have serviceId set and scope=SINGLE,
-- so behavior is unchanged. New ALL-scope tokens leave serviceId NULL.
--
-- NOTE: Production deployment uses `prisma db push --accept-data-loss` (see
-- Dockerfile), so this file is descriptive — it is not auto-applied by
-- `prisma migrate deploy`. The same DDL is what `db push` will generate
-- from the schema.

CREATE TYPE "TokenScope" AS ENUM ('SINGLE', 'ALL');

ALTER TABLE "tokens"
  ALTER COLUMN "serviceId" DROP NOT NULL,
  ADD COLUMN "scope" "TokenScope" NOT NULL DEFAULT 'SINGLE';
