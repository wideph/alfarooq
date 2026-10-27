-- Office wave 44:
--   Case.customLabel / customLabelColor — admin ka custom label.
--   Case.deptCommissionRounds — department commission kitni dafa (per kind) dena
--   hai; admin status peeche kar ke kaam dobara karwaye to har dafa faisla.
-- Idempotent, additive only.

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "customLabel" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "customLabelColor" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "deptCommissionRounds" JSONB;
