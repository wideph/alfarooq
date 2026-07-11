ALTER TABLE "BotTrainingEntry"
  ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS "evidence" JSONB,
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

UPDATE "BotTrainingEntry"
SET "reviewStatus" = 'pending'
WHERE "source" = 'ai' AND "reviewStatus" = 'approved';

UPDATE "BotTrainingEntry"
SET "approvedAt" = COALESCE("approvedAt", "updatedAt")
WHERE "reviewStatus" = 'approved';

CREATE INDEX IF NOT EXISTS "BotTrainingEntry_courseId_reviewStatus_idx"
  ON "BotTrainingEntry"("courseId", "reviewStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "BotTrainingEntry_ai_live_sourceRef_key"
  ON "BotTrainingEntry"("courseId", "sourceRef")
  WHERE "source" = 'ai' AND "sourceRef" IS NOT NULL;
