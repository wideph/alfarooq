-- Office wave 20 (perf): indexes for the hot office read paths.
-- All statements are idempotent (IF NOT EXISTS) and match Prisma's naming
-- convention so a future `prisma migrate diff` stays clean.
--
-- Justification (query → index):
--   GET /api/office/cases (booking-office scope, ORDER BY createdAt) → Case(bookingOfficeId, createdAt)
--   payments per case filtered by status (dashboard nested select,
--   activateWorkflowOnFirstPayment, expenses autoRefinalize)           → Payment(caseId, status)
--   finance/users + finance/users/[memberId] ledger groupBy / filters  → LedgerEntry(memberId, type, direction)
--   GET /api/office/notifications (20s bell polling, latest 20)        → Notification(userId, createdAt)
--   GET cases/[id]/files (caseId + department filter)                  → CaseFile(caseId, department)
--   unseen-remark warnings + booking badge (target + seenAt IS NULL)   → CaseRemarkRecipient(target, seenAt)

CREATE INDEX IF NOT EXISTS "Case_bookingOfficeId_createdAt_idx" ON "Case"("bookingOfficeId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_caseId_status_idx" ON "Payment"("caseId", "status");
CREATE INDEX IF NOT EXISTS "LedgerEntry_memberId_type_direction_idx" ON "LedgerEntry"("memberId", "type", "direction");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "CaseFile_caseId_department_idx" ON "CaseFile"("caseId", "department");
CREATE INDEX IF NOT EXISTS "CaseRemarkRecipient_target_seenAt_idx" ON "CaseRemarkRecipient"("target", "seenAt");
