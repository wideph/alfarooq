-- §W60 — dates ka nizaam mazboot.
-- 1) AI scan ki yaad (scope + 14 din ki window). Sirf kamyab scan likha jata hai.
CREATE TABLE IF NOT EXISTS "OfficeDateScan" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OfficeDateScan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfficeDateScan_scope_windowStart_key" ON "OfficeDateScan"("scope", "windowStart");

-- 2) Zehreeli cache saaf: AI fail hone par weekend-only andaza ("FALLBACK")
--    WorkingDayCache mein hamesha ke liye "working day" ban kar likha jata tha
--    (9 Nov Iqbal Day jaisi chhutti bhi) aur baad mein usi par bharosa hota tha.
--    Naya code FALLBACK rows nahi parhta, na likhta hai. Admin (MANUAL) aur AI
--    rows wahi rehti hain. Dobara chalane par kuch nahi badalta.
DELETE FROM "WorkingDayCache" WHERE "source" = 'FALLBACK';
