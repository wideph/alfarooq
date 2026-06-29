ALTER TABLE "BotTrainingEntry" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "BotTrainingEntry" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;

CREATE INDEX IF NOT EXISTS "BotTrainingEntry_courseId_source_idx" ON "BotTrainingEntry"("courseId", "source");
