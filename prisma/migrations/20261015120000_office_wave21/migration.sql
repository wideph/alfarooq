-- Office wave 21 (schema + finance/expense backend):
--   1. Case.onlineVerificationNumber — board/case online verification tracking number.
--   2. CaseExpense.deductFromCommission + OfficeExpense.deductFromCommission (F3/F5):
--      FIXED_COMMISSION offices par flag-on expenses commission ledger se kat-te hain.
--   3. LedgerEntry.adminId — optional admin attribution (department commission entries),
--      SetNull on admin delete.
--   4. DepartmentCommissionRule — per admin × category (× set) print/attestation
--      commission amounts; setId '' = category-wide default.
-- All statements idempotent (IF NOT EXISTS / pg_constraint guards) and match
-- Prisma's naming convention so a future `prisma migrate diff` stays clean.

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "onlineVerificationNumber" TEXT;

ALTER TABLE "CaseExpense" ADD COLUMN IF NOT EXISTS "deductFromCommission" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OfficeExpense" ADD COLUMN IF NOT EXISTS "deductFromCommission" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "adminId" TEXT;
CREATE INDEX IF NOT EXISTS "LedgerEntry_adminId_idx" ON "LedgerEntry"("adminId");

CREATE TABLE IF NOT EXISTS "DepartmentCommissionRule" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "setId" TEXT NOT NULL DEFAULT '',
  "printAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "attestationAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentCommissionRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentCommissionRule_adminId_categoryId_setId_key"
  ON "DepartmentCommissionRule"("adminId", "categoryId", "setId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_adminId_fkey') THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DepartmentCommissionRule_adminId_fkey') THEN
    ALTER TABLE "DepartmentCommissionRule" ADD CONSTRAINT "DepartmentCommissionRule_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DepartmentCommissionRule_categoryId_fkey') THEN
    ALTER TABLE "DepartmentCommissionRule" ADD CONSTRAINT "DepartmentCommissionRule_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "CaseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
