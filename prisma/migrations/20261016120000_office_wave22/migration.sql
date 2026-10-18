-- Office wave 22 (F22.1 — salary set option):
--   BookingOfficeMember.monthlySalary — monthly salary amount set per member
--   (used by SALARY offices; stored regardless of office type).
-- Idempotent (IF NOT EXISTS) and matches Prisma's naming convention so a
-- future `prisma migrate diff` stays clean.

ALTER TABLE "BookingOfficeMember" ADD COLUMN IF NOT EXISTS "monthlySalary" DECIMAL(12,2) NOT NULL DEFAULT 0;
