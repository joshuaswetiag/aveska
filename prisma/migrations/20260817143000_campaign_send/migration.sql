-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SEND_CAMPAIGN';
ALTER TYPE "CampaignStatus" ADD VALUE 'SENDING';
ALTER TYPE "CampaignStatus" ADD VALUE 'SENT';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "sentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "sendError" TEXT,
ADD COLUMN "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "fromEmail" TEXT;
