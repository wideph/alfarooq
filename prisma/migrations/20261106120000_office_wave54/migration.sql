-- Office wave 54: case delete par department kharche ka admin faisla — "usi
-- office par rahe" wala kharcha OfficeExpense ban kar user ka wapsi ka haq
-- (paidByAdminId) saath rakhta hai. Idempotent, additive only.

ALTER TABLE "OfficeExpense" ADD COLUMN IF NOT EXISTS "paidByAdminId" TEXT;
CREATE INDEX IF NOT EXISTS "OfficeExpense_paidByAdminId_idx" ON "OfficeExpense"("paidByAdminId");
