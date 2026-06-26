-- Admin roles and partial permissions
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "permissions" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "createdByAdmin" TEXT;
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Ad platform and AI bot settings. Secrets are stored server-side only.
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "metaPixelId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "metaAccessToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "googleAdsTagId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "tiktokPixelId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "botEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "botProvider" TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "botModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "botApiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "botSystemNote" TEXT NOT NULL DEFAULT '';

-- User questions can now come from the bot and can be saved for training only.
ALTER TABLE "UserQuestion" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "UserQuestion" ADD COLUMN IF NOT EXISTS "publishForUsers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserQuestion" ADD COLUMN IF NOT EXISTS "trainingOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserQuestion" ADD COLUMN IF NOT EXISTS "visitorId" TEXT;
ALTER TABLE "UserQuestion" ADD COLUMN IF NOT EXISTS "botConversationId" TEXT;

CREATE TABLE IF NOT EXISTS "Visitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "currentPath" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'visitor',
    "timeSpentSeconds" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Visitor_visitorKey_key" ON "Visitor"("visitorKey");
CREATE INDEX IF NOT EXISTS "Visitor_status_idx" ON "Visitor"("status");
CREATE INDEX IF NOT EXISTS "Visitor_source_idx" ON "Visitor"("source");
CREATE INDEX IF NOT EXISTS "Visitor_lastSeenAt_idx" ON "Visitor"("lastSeenAt");

CREATE TABLE IF NOT EXISTS "VisitorEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "status" TEXT,
    "payload" JSONB,
    "sentToMeta" BOOLEAN NOT NULL DEFAULT false,
    "sentToGoogle" BOOLEAN NOT NULL DEFAULT false,
    "sentToTikTok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VisitorEvent_visitorId_idx" ON "VisitorEvent"("visitorId");
CREATE INDEX IF NOT EXISTS "VisitorEvent_createdAt_idx" ON "VisitorEvent"("createdAt");

CREATE TABLE IF NOT EXISTS "BotTrainingEntry" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotTrainingEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotTrainingEntry_courseId_idx" ON "BotTrainingEntry"("courseId");

CREATE TABLE IF NOT EXISTS "BotConversation" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT,
    "courseId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BotConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotConversation_visitorId_idx" ON "BotConversation"("visitorId");
CREATE INDEX IF NOT EXISTS "BotConversation_courseId_idx" ON "BotConversation"("courseId");
CREATE INDEX IF NOT EXISTS "BotConversation_expiresAt_idx" ON "BotConversation"("expiresAt");

CREATE TABLE IF NOT EXISTS "BotMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BotMessage_conversationId_idx" ON "BotMessage"("conversationId");
CREATE INDEX IF NOT EXISTS "BotMessage_createdAt_idx" ON "BotMessage"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserQuestion_visitorId_fkey'
  ) THEN
    ALTER TABLE "UserQuestion" ADD CONSTRAINT "UserQuestion_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisitorEvent_visitorId_fkey'
  ) THEN
    ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotTrainingEntry_courseId_fkey'
  ) THEN
    ALTER TABLE "BotTrainingEntry" ADD CONSTRAINT "BotTrainingEntry_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotConversation_visitorId_fkey'
  ) THEN
    ALTER TABLE "BotConversation" ADD CONSTRAINT "BotConversation_visitorId_fkey"
    FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotConversation_courseId_fkey'
  ) THEN
    ALTER TABLE "BotConversation" ADD CONSTRAINT "BotConversation_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BotMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "BotMessage" ADD CONSTRAINT "BotMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "BotConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
