ALTER TABLE "Visitor" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;

CREATE INDEX IF NOT EXISTS "Visitor_ipAddress_idx" ON "Visitor"("ipAddress");
CREATE INDEX IF NOT EXISTS "Visitor_status_ipAddress_idx" ON "Visitor"("status", "ipAddress");
