-- Office wave 30 — courier department commission:
--   DepartmentCommissionRule.courierAmount — per dept user × category × set,
--   credited when that user's courier slip upload moves a case to DELIVERED.
--   Default 0 = no commission (owner rule: commission set na ho to 0).
-- Idempotent (IF NOT EXISTS), additive only — old code keeps working.
-- (No SQL needed for the new case status WAITING_FOR_COURIER_ADDRESS:
--  Case.status is TEXT with app-level validation.)

ALTER TABLE "DepartmentCommissionRule" ADD COLUMN IF NOT EXISTS "courierAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
