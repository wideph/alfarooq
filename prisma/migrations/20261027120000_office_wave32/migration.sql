-- Office wave 32 — user ka "Remarks" tab:
--   CaseRemarkDone — kis user ne kaun sa remark "Done" kiya (per user, per
--   remark). Done hone tak remark us user ke Remarks tab mein rehta hai.
-- Idempotent, additive only.

CREATE TABLE IF NOT EXISTS "CaseRemarkDone" (
  "id" TEXT NOT NULL,
  "remarkId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseRemarkDone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaseRemarkDone_remarkId_adminId_key" ON "CaseRemarkDone"("remarkId", "adminId");
CREATE INDEX IF NOT EXISTS "CaseRemarkDone_adminId_idx" ON "CaseRemarkDone"("adminId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRemarkDone_remarkId_fkey') THEN
    ALTER TABLE "CaseRemarkDone" ADD CONSTRAINT "CaseRemarkDone_remarkId_fkey"
      FOREIGN KEY ("remarkId") REFERENCES "CaseRemark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRemarkDone_adminId_fkey') THEN
    ALTER TABLE "CaseRemarkDone" ADD CONSTRAINT "CaseRemarkDone_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
