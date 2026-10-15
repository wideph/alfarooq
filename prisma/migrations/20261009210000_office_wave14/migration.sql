-- Wave 14: payout requests (accept-to-ledger flow)
CREATE TABLE IF NOT EXISTS "PayoutRequest" (
  "id" TEXT NOT NULL,
  "bookingOfficeId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
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
  CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PayoutRequest_memberId_status_idx" ON "PayoutRequest"("memberId", "status");
CREATE INDEX IF NOT EXISTS "PayoutRequest_bookingOfficeId_status_idx" ON "PayoutRequest"("bookingOfficeId", "status");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayoutRequest_bookingOfficeId_fkey') THEN
    ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_bookingOfficeId_fkey"
      FOREIGN KEY ("bookingOfficeId") REFERENCES "BookingOffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PayoutRequest_memberId_fkey') THEN
    ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "BookingOfficeMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
