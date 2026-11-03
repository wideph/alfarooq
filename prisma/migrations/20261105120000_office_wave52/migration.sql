-- Office wave 52: department kharche admin ke review ke baad hi system mein.
-- Naya table DeptExpenseRequest (PENDING / ACCEPTED / REJECTED). Idempotent,
-- additive only — purane tables / data nahi badalte.

CREATE TABLE IF NOT EXISTS "DeptExpenseRequest" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "caseId" TEXT,
  "caseNumber" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT NOT NULL,
  "expenseDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAmount" DECIMAL(12,2),
  "decisionNote" TEXT,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "caseExpenseId" TEXT,
  "companyExpenseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeptExpenseRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeptExpenseRequest_status_createdAt_idx" ON "DeptExpenseRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DeptExpenseRequest_adminId_status_idx" ON "DeptExpenseRequest"("adminId", "status");
CREATE INDEX IF NOT EXISTS "DeptExpenseRequest_caseId_idx" ON "DeptExpenseRequest"("caseId");
