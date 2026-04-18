-- KYA フロー: Buyer にエージェント身元情報フィールドを追加
ALTER TABLE "buyers" ADD COLUMN "agentName"        TEXT;
ALTER TABLE "buyers" ADD COLUMN "agentDescription" TEXT;
ALTER TABLE "buyers" ADD COLUMN "kyaAppliedAt"     TIMESTAMP(3);
