-- Office wave 51: department kharche (courier slip ke saath courier amount,
-- printing / attestation / courier ka "Other expense"), un ki wapsi aur
-- department commission ki payment request (accept flow), commission office
-- ka expense rule (% commission se minus — default 0, sirf naye cases par).
-- Idempotent, additive only.

ALTER TABLE "BookingOffice" ADD COLUMN IF NOT EXISTS "expenseDeductPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "expenseDeductPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "CaseExpense" ADD COLUMN IF NOT EXISTS "commissionDeductPercent" DECIMAL(5,2);
ALTER TABLE "CaseExpense" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "CaseExpense" ADD COLUMN IF NOT EXISTS "paidByAdminId" TEXT;
CREATE INDEX IF NOT EXISTS "CaseExpense_paidByAdminId_idx" ON "CaseExpense"("paidByAdminId");

-- Purane "commission se minus" (W21 flag) expenses = 100% — un ki ledger rows
-- wahi rehti hain (sync ka target pehle jaisa).
UPDATE "CaseExpense" SET "commissionDeductPercent" = 100
  WHERE "deductFromCommission" = true AND "commissionDeductPercent" IS NULL;

ALTER TABLE "CompanyExpense" ADD COLUMN IF NOT EXISTS "paidByAdminId" TEXT;
CREATE INDEX IF NOT EXISTS "CompanyExpense_paidByAdminId_idx" ON "CompanyExpense"("paidByAdminId");

CREATE TABLE IF NOT EXISTS "DeptPayoutRequest" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'CASH',
  "entryDate" TIMESTAMP(3) NOT NULL,
  "remarks" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "ledgerEntryId" TEXT,
  "createdById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeptPayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeptPayoutRequest_adminId_status_idx" ON "DeptPayoutRequest"("adminId", "status");
CREATE INDEX IF NOT EXISTS "DeptPayoutRequest_status_idx" ON "DeptPayoutRequest"("status");
