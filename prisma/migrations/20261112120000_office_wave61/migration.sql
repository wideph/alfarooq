-- §W61 — har date ka ONLINE check (Tavily khabrein + attached AI).
-- 1) W60 ki window-scan yaad ab istemal nahi (per-din check ne jagah li).
DROP TABLE IF EXISTS "OfficeDateScan";

-- 2) Har din + scope ka online faisla (sirf kamyab faisla likha jata hai).
CREATE TABLE IF NOT EXISTS "OfficeDayCheck" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL,
    "reason" TEXT,
    "sources" JSONB,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OfficeDayCheck_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OfficeDayCheck_date_scope_key" ON "OfficeDayCheck"("date", "scope");

-- 3) Online check ki settings (Tavily key) — ek row "global".
CREATE TABLE IF NOT EXISTS "OfficeDateConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "tavilyApiKey" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OfficeDateConfig_pkey" PRIMARY KEY ("id")
);

-- 4) Case par check ki "lease" (do check ek saath na chalen).
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "datesCheckingUntil" TIMESTAMP(3);
