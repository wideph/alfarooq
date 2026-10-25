-- Office wave 35 — Cases tab ka read / unread (super admin):
--   CaseRead — kis user ne kaun sa case kis status par "Read" kiya. Case ka
--   status badle (queue change) to row ka status match nahi karta aur case
--   phir unread ho jata hai.
-- Idempotent, additive only.

CREATE TABLE IF NOT EXISTS "CaseRead" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaseRead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaseRead_caseId_adminId_key" ON "CaseRead"("caseId", "adminId");
CREATE INDEX IF NOT EXISTS "CaseRead_adminId_idx" ON "CaseRead"("adminId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRead_caseId_fkey') THEN
    ALTER TABLE "CaseRead" ADD CONSTRAINT "CaseRead_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRead_adminId_fkey') THEN
    ALTER TABLE "CaseRead" ADD CONSTRAINT "CaseRead_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
