-- AlterTable
ALTER TABLE "tokens" ADD COLUMN "clientUserAgent" VARCHAR(128);

-- CreateIndex
CREATE INDEX "tokens_clientUserAgent_createdAt_idx" ON "tokens"("clientUserAgent", "createdAt");
