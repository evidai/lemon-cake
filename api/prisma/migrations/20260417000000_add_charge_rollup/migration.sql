-- CreateEnum
CREATE TYPE "RollupGranularity" AS ENUM ('DAILY', 'MONTHLY');

-- CreateTable
CREATE TABLE "charge_rollups" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "granularity" "RollupGranularity" NOT NULL DEFAULT 'DAILY',
    "chargeCount" INTEGER NOT NULL,
    "totalUsdc" DECIMAL(38,18) NOT NULL,
    "totalJpy" INTEGER NOT NULL,
    "jpyRate" DECIMAL(10,4) NOT NULL,
    "accountingProvider" "AccountingProvider",
    "externalDealId" TEXT,
    "syncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "serviceBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charge_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charge_rollups_buyerId_periodStart_idx" ON "charge_rollups"("buyerId", "periodStart");

-- AddForeignKey
ALTER TABLE "charge_rollups" ADD CONSTRAINT "charge_rollups_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "buyers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
