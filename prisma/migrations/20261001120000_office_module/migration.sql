-- Office module: cases, payments, booking offices, ledger, finance.
-- See docs/office-module/02_ARCHITECTURE.md. Idempotent like earlier migrations.

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "bookingOfficeId" TEXT;
CREATE INDEX IF NOT EXISTS "Admin_bookingOfficeId_idx" ON "Admin"("bookingOfficeId");

CREATE TABLE IF NOT EXISTS "BookingOffice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingOffice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BookingOfficeMember" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "adminId" TEXT,
    "name" TEXT NOT NULL,
    "profitPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingOfficeMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BookingOfficeMember_adminId_key" ON "BookingOfficeMember"("adminId");
CREATE INDEX IF NOT EXISTS "BookingOfficeMember_bookingOfficeId_idx" ON "BookingOfficeMember"("bookingOfficeId");

CREATE TABLE IF NOT EXISTS "BookingOfficeCommission" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "BookingOfficeCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BookingOfficeCommission_bookingOfficeId_categoryId_key"
  ON "BookingOfficeCommission"("bookingOfficeId", "categoryId");

CREATE TABLE IF NOT EXISTS "CaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAmount" DECIMAL(12,2),
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaseCategory_name_key" ON "CaseCategory"("name");

CREATE TABLE IF NOT EXISTS "AttestationType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttestationType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AttestationType_name_key" ON "AttestationType"("name");

CREATE TABLE IF NOT EXISTS "CaseCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CaseCounter_pkey" PRIMARY KEY ("year")
);

CREATE TABLE IF NOT EXISTS "Case" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "categoryId" TEXT,
    "clientName" TEXT NOT NULL,
    "rollNumber" TEXT,
    "registrationNumber" TEXT,
    "agreedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "claimedRemaining" DECIMAL(12,2),
    "claimedRemainingStatus" TEXT NOT NULL DEFAULT 'NONE',
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commissionHalfCreditedAt" TIMESTAMP(3),
    "commissionFullCreditedAt" TIMESTAMP(3),
    "extraSharePercent" DECIMAL(5,2),
    "extraShareCreditedAt" TIMESTAMP(3),
    "profitFinalizedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "isPrinted" BOOLEAN NOT NULL DEFAULT false,
    "printedAt" TIMESTAMP(3),
    "expectedPrintingDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Case_caseNumber_key" ON "Case"("caseNumber");
CREATE INDEX IF NOT EXISTS "Case_bookingOfficeId_status_idx" ON "Case"("bookingOfficeId", "status");
CREATE INDEX IF NOT EXISTS "Case_status_idx" ON "Case"("status");
CREATE INDEX IF NOT EXISTS "Case_createdAt_idx" ON "Case"("createdAt");
CREATE INDEX IF NOT EXISTS "Case_rollNumber_idx" ON "Case"("rollNumber");
CREATE INDEX IF NOT EXISTS "Case_registrationNumber_idx" ON "Case"("registrationNumber");

CREATE TABLE IF NOT EXISTS "CaseContact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseContact_caseId_idx" ON "CaseContact"("caseId");

CREATE TABLE IF NOT EXISTS "CaseAddress" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseAddress_caseId_idx" ON "CaseAddress"("caseId");

CREATE TABLE IF NOT EXISTS "CaseAttestation" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "attestationTypeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "notes" TEXT,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseAttestation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaseAttestation_caseId_attestationTypeId_key"
  ON "CaseAttestation"("caseId", "attestationTypeId");

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "slipKey" TEXT,
    "slipType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedById" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Payment_caseId_idx" ON "Payment"("caseId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Payment_paymentDate_idx" ON "Payment"("paymentDate");

CREATE TABLE IF NOT EXISTS "CaseExpense" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseExpense_caseId_idx" ON "CaseExpense"("caseId");
CREATE INDEX IF NOT EXISTS "CaseExpense_expenseDate_idx" ON "CaseExpense"("expenseDate");

CREATE TABLE IF NOT EXISTS "LedgerEntry" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "memberId" TEXT,
    "caseId" TEXT,
    "paymentId" TEXT,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LedgerEntry_bookingOfficeId_entryDate_idx" ON "LedgerEntry"("bookingOfficeId", "entryDate");
CREATE INDEX IF NOT EXISTS "LedgerEntry_memberId_idx" ON "LedgerEntry"("memberId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_caseId_idx" ON "LedgerEntry"("caseId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_entryDate_idx" ON "LedgerEntry"("entryDate");

CREATE TABLE IF NOT EXISTS "SalaryEntry" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "memberId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "paidDate" TIMESTAMP(3),
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalaryEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalaryEntry_bookingOfficeId_periodMonth_idx" ON "SalaryEntry"("bookingOfficeId", "periodMonth");
CREATE INDEX IF NOT EXISTS "SalaryEntry_paidDate_idx" ON "SalaryEntry"("paidDate");

CREATE TABLE IF NOT EXISTS "CompanyExpense" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CompanyExpense_expenseDate_idx" ON "CompanyExpense"("expenseDate");

CREATE TABLE IF NOT EXISTS "WorkingDayCache" (
    "id" TEXT NOT NULL,
    "candidateDate" TIMESTAMP(3) NOT NULL,
    "workingDate" TIMESTAMP(3) NOT NULL,
    "isCandidateWorking" BOOLEAN NOT NULL,
    "reason" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkingDayCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkingDayCache_candidateDate_key" ON "WorkingDayCache"("candidateDate");

CREATE TABLE IF NOT EXISTS "OfficeAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OfficeAuditLog_entity_entityId_idx" ON "OfficeAuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "OfficeAuditLog_createdAt_idx" ON "OfficeAuditLog"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Admin_bookingOfficeId_fkey') THEN
    ALTER TABLE "Admin" ADD CONSTRAINT "Admin_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingOfficeMember_bookingOfficeId_fkey') THEN
    ALTER TABLE "BookingOfficeMember" ADD CONSTRAINT "BookingOfficeMember_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingOfficeMember_adminId_fkey') THEN
    ALTER TABLE "BookingOfficeMember" ADD CONSTRAINT "BookingOfficeMember_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingOfficeCommission_bookingOfficeId_fkey') THEN
    ALTER TABLE "BookingOfficeCommission" ADD CONSTRAINT "BookingOfficeCommission_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BookingOfficeCommission_categoryId_fkey') THEN
    ALTER TABLE "BookingOfficeCommission" ADD CONSTRAINT "BookingOfficeCommission_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CaseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_bookingOfficeId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_categoryId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CaseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseContact_caseId_fkey') THEN
    ALTER TABLE "CaseContact" ADD CONSTRAINT "CaseContact_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseAddress_caseId_fkey') THEN
    ALTER TABLE "CaseAddress" ADD CONSTRAINT "CaseAddress_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseAttestation_caseId_fkey') THEN
    ALTER TABLE "CaseAttestation" ADD CONSTRAINT "CaseAttestation_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseAttestation_attestationTypeId_fkey') THEN
    ALTER TABLE "CaseAttestation" ADD CONSTRAINT "CaseAttestation_attestationTypeId_fkey"
    FOREIGN KEY ("attestationTypeId") REFERENCES "AttestationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Payment_caseId_fkey') THEN
    ALTER TABLE "Payment" ADD CONSTRAINT "Payment_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseExpense_caseId_fkey') THEN
    ALTER TABLE "CaseExpense" ADD CONSTRAINT "CaseExpense_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_bookingOfficeId_fkey') THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_memberId_fkey') THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "BookingOfficeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_caseId_fkey') THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_paymentId_fkey') THEN
    ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalaryEntry_bookingOfficeId_fkey') THEN
    ALTER TABLE "SalaryEntry" ADD CONSTRAINT "SalaryEntry_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalaryEntry_memberId_fkey') THEN
    ALTER TABLE "SalaryEntry" ADD CONSTRAINT "SalaryEntry_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "BookingOfficeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
