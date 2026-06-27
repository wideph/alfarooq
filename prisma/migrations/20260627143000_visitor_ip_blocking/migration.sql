ALTER TABLE "Visitor" ADD COLUMN "ipAddress" TEXT;

CREATE INDEX "Visitor_ipAddress_idx" ON "Visitor"("ipAddress");
CREATE INDEX "Visitor_status_ipAddress_idx" ON "Visitor"("status", "ipAddress");
