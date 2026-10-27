-- Office wave 45: commission office ka case admin / cashier (office ka member
-- nahi) banaye to commission ka faisla (FULL / NONE / PARTIAL) aur kis member
-- ke account mein. Idempotent, additive only.

ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "commissionMode" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "commissionMemberId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Case_commissionMemberId_fkey') THEN
    ALTER TABLE "Case" ADD CONSTRAINT "Case_commissionMemberId_fkey"
      FOREIGN KEY ("commissionMemberId") REFERENCES "BookingOfficeMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
