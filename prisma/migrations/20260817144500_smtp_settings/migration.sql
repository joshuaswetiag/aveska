-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "emailProvider" TEXT,
ADD COLUMN "smtpHost" TEXT,
ADD COLUMN "smtpPort" INTEGER,
ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "smtpUser" TEXT,
ADD COLUMN "smtpPassword" TEXT,
ADD COLUMN "emailSendDelayMs" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN "maropostAccountId" TEXT,
ADD COLUMN "maropostApiKey" TEXT,
ADD COLUMN "maropostCampaignName" TEXT;
