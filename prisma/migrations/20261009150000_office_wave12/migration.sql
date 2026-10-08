-- Wave 12: profit-share percent snapshot (old cases freeze on percent change)
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "profitShareSnapshot" JSONB;
CREATE INDEX IF NOT EXISTS "CaseRemarkRecipient_target_seenAt_idx" ON "CaseRemarkRecipient"("target", "seenAt");
