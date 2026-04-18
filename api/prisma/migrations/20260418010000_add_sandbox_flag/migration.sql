-- Sandbox フラグ: 実USDCを動かさずにモック課金を行う
ALTER TABLE "tokens"  ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "charges" ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;
