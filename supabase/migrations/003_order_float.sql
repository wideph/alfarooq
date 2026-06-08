-- Preference numbers with decimals (e.g. 1, 1.5, 2)
-- Run once in Supabase SQL Editor

ALTER TABLE "Course"
  ALTER COLUMN "order" SET DATA TYPE DOUBLE PRECISION USING "order"::double precision,
  ALTER COLUMN "order" SET DEFAULT 0;

ALTER TABLE "Question"
  ALTER COLUMN "order" SET DATA TYPE DOUBLE PRECISION USING "order"::double precision,
  ALTER COLUMN "order" SET DEFAULT 0;

ALTER TABLE "UserQuestion"
  ADD COLUMN IF NOT EXISTS "order" DOUBLE PRECISION NOT NULL DEFAULT 0;
