-- Office wave 31 — simple department commission settings:
--   DepartmentCommissionSetting — per dept user (adminId unique), category se
--   azad settings. courierAmount = har delivered case (courier slip) par ek hi
--   raqam. Printing (per category) aur attestation (per Set of Attestations)
--   pehle ki tarah DepartmentCommissionRule mein.
-- Idempotent, additive only (purana code chalta rehta hai).

CREATE TABLE IF NOT EXISTS "DepartmentCommissionSetting" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "courierAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DepartmentCommissionSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DepartmentCommissionSetting_adminId_key"
  ON "DepartmentCommissionSetting"("adminId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DepartmentCommissionSetting_adminId_fkey') THEN
    ALTER TABLE "DepartmentCommissionSetting" ADD CONSTRAINT "DepartmentCommissionSetting_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
