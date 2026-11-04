-- Office wave 56: extra services, extra payment ke tukde (tranches), dobara kaam
-- ka department commission bataur case kharcha, reissue filing round.
-- Idempotent, additive only — purane rows waise hi (naye columns default / null).

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "extraServicesAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "deptCommissionChargeFrom" JSONB;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "filingRoundAt" TIMESTAMP(3);

ALTER TABLE "CaseExpense" ADD COLUMN IF NOT EXISTS "deptLedgerEntryId" TEXT;
CREATE INDEX IF NOT EXISTS "CaseExpense_deptLedgerEntryId_idx" ON "CaseExpense"("deptLedgerEntryId");

CREATE TABLE IF NOT EXISTS "CaseService" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reissue" BOOLEAN NOT NULL DEFAULT false,
  "reissueDoneAt" TIMESTAMP(3),
  "attestationIds" JSONB,
  "musadiqa" BOOLEAN NOT NULL DEFAULT false,
  "musadiqaStatus" TEXT,
  "musadiqaDoneAt" TIMESTAMP(3),
  "customName" TEXT,
  "customDoneAt" TIMESTAMP(3),
  "remarks" TEXT,
  "imageKey" TEXT,
  "imageType" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CaseService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CaseService_caseId_idx" ON "CaseService"("caseId");
CREATE INDEX IF NOT EXISTS "CaseService_musadiqaStatus_idx" ON "CaseService"("musadiqaStatus");

CREATE TABLE IF NOT EXISTS "ExtraShareTranche" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "extraAmount" DECIMAL(12,2) NOT NULL,
  "shareAmount" DECIMAL(12,2) NOT NULL,
  "mode" TEXT NOT NULL,
  "percent" DECIMAL(5,2),
  "receivedAt" DECIMAL(12,2) NOT NULL,
  "decidedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtraShareTranche_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ExtraShareTranche_caseId_idx" ON "ExtraShareTranche"("caseId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CaseService_caseId_fkey') THEN
    ALTER TABLE "CaseService" ADD CONSTRAINT "CaseService_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExtraShareTranche_caseId_fkey') THEN
    ALTER TABLE "ExtraShareTranche" ADD CONSTRAINT "ExtraShareTranche_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Purane faisle (Case.extraSharePercent) → ek tukra, sirf jahan abhi extra hai
-- (received > agreed) aur koi tukra nahi. Hissa = ROUND(extra × % / 100, 2) —
-- bilkul wahi jo pehle se EXTRA_SHARE mein credit hai (ledger nahi badalta).
INSERT INTO "ExtraShareTranche" ("id", "caseId", "extraAmount", "shareAmount", "mode", "percent", "receivedAt", "decidedById", "createdAt")
SELECT 'legacy_' || c."id",
       c."id",
       r."received" - c."agreedAmount",
       ROUND((r."received" - c."agreedAmount") * c."extraSharePercent" / 100, 2),
       'PERCENT',
       c."extraSharePercent",
       r."received",
       'system-wave56',
       CURRENT_TIMESTAMP
FROM "Case" c
JOIN "BookingOffice" o ON o."id" = c."bookingOfficeId"
JOIN (
  SELECT "caseId", SUM("amount") AS "received"
  FROM "Payment"
  WHERE "status" = 'RECEIVED'
  GROUP BY "caseId"
) r ON r."caseId" = c."id"
WHERE o."type" = 'FIXED_COMMISSION'
  AND c."extraSharePercent" IS NOT NULL
  AND r."received" > c."agreedAmount"
  AND NOT EXISTS (SELECT 1 FROM "ExtraShareTranche" t WHERE t."caseId" = c."id");
