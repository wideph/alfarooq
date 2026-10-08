-- Office wave 2: category sets/steps, holidays, 2019 date pool, board attas counter,
-- department files, targeted remarks, discount/bonus requests, office expenses,
-- department links + new Case columns.
-- See docs/office-module/06_NEW_REQUIREMENTS.md. Idempotent like earlier migrations.

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "setId" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "isUrgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "clientPictureKey" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "clientPictureType" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "agreedAmountRemarks" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "courierNumber" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "boardAttasNumber" TEXT;
CREATE INDEX IF NOT EXISTS "Case_boardAttasNumber_idx" ON "Case"("boardAttasNumber");

CREATE TABLE IF NOT EXISTS "CategorySet" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategorySet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CategorySet_categoryId_name_key" ON "CategorySet"("categoryId", "name");

CREATE TABLE IF NOT EXISTS "CategorySetStep" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "CategorySetStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CategorySetStep_setId_idx" ON "CategorySetStep"("setId");

CREATE TABLE IF NOT EXISTS "HolidayClosure" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'PAKISTAN',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HolidayClosure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HolidayClosure_date_scope_key" ON "HolidayClosure"("date", "scope");

CREATE TABLE IF NOT EXISTS "WorkingDatePool" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkingDatePool_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkingDatePool_year_date_key" ON "WorkingDatePool"("year", "date");

CREATE TABLE IF NOT EXISTS "BoardAttasCounter" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "last" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BoardAttasCounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CaseFile" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "stepKey" TEXT,
    "fileKey" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "title" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseFile_caseId_idx" ON "CaseFile"("caseId");
CREATE INDEX IF NOT EXISTS "CaseFile_department_idx" ON "CaseFile"("department");

CREATE TABLE IF NOT EXISTS "CaseRemark" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseRemark_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseRemark_caseId_idx" ON "CaseRemark"("caseId");

CREATE TABLE IF NOT EXISTS "CaseRemarkRecipient" (
    "id" TEXT NOT NULL,
    "remarkId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    CONSTRAINT "CaseRemarkRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CaseRemarkRecipient_remarkId_target_key"
  ON "CaseRemarkRecipient"("remarkId", "target");

CREATE TABLE IF NOT EXISTS "DiscountRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deductFrom" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscountRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DiscountRequest_caseId_idx" ON "DiscountRequest"("caseId");

CREATE TABLE IF NOT EXISTS "BonusRequest" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "caseId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deductFrom" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BonusRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BonusRequest_bookingOfficeId_idx" ON "BonusRequest"("bookingOfficeId");
CREATE INDEX IF NOT EXISTS "BonusRequest_caseId_idx" ON "BonusRequest"("caseId");

CREATE TABLE IF NOT EXISTS "OfficeExpense" (
    "id" TEXT NOT NULL,
    "bookingOfficeId" TEXT NOT NULL,
    "memberId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OfficeExpense_bookingOfficeId_idx" ON "OfficeExpense"("bookingOfficeId");
CREATE INDEX IF NOT EXISTS "OfficeExpense_expenseDate_idx" ON "OfficeExpense"("expenseDate");

CREATE TABLE IF NOT EXISTS "DepartmentLink" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepartmentLink_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_setId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "CategorySet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CategorySet_categoryId_fkey') THEN
    ALTER TABLE "CategorySet" ADD CONSTRAINT "CategorySet_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CaseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CategorySetStep_setId_fkey') THEN
    ALTER TABLE "CategorySetStep" ADD CONSTRAINT "CategorySetStep_setId_fkey"
    FOREIGN KEY ("setId") REFERENCES "CategorySet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseFile_caseId_fkey') THEN
    ALTER TABLE "CaseFile" ADD CONSTRAINT "CaseFile_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRemark_caseId_fkey') THEN
    ALTER TABLE "CaseRemark" ADD CONSTRAINT "CaseRemark_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseRemarkRecipient_remarkId_fkey') THEN
    ALTER TABLE "CaseRemarkRecipient" ADD CONSTRAINT "CaseRemarkRecipient_remarkId_fkey"
    FOREIGN KEY ("remarkId") REFERENCES "CaseRemark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DiscountRequest_caseId_fkey') THEN
    ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BonusRequest_bookingOfficeId_fkey') THEN
    ALTER TABLE "BonusRequest" ADD CONSTRAINT "BonusRequest_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BonusRequest_caseId_fkey') THEN
    ALTER TABLE "BonusRequest" ADD CONSTRAINT "BonusRequest_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfficeExpense_bookingOfficeId_fkey') THEN
    ALTER TABLE "OfficeExpense" ADD CONSTRAINT "OfficeExpense_bookingOfficeId_fkey"
    FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OfficeExpense_memberId_fkey') THEN
    ALTER TABLE "OfficeExpense" ADD CONSTRAINT "OfficeExpense_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "BookingOfficeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
