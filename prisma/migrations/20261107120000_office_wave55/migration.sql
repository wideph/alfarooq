-- Office wave 55: courier department ka Bykea kharcha (case ka expense, user ki
-- wapsi "Other expenses" mein). Case delete par "usi office par rahe" wale
-- OfficeExpense ko qism yaad rahe (COURIER / BYKEA). Idempotent, additive only.

ALTER TABLE "OfficeExpense" ADD COLUMN IF NOT EXISTS "kind" TEXT;
