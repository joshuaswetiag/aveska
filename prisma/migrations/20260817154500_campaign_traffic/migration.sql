-- AlterTable
ALTER TABLE "CampaignRecipient" ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "clickedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CampaignTraffic" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTraffic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignTraffic_campaignId_createdAt_idx" ON "CampaignTraffic"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignTraffic_customerId_idx" ON "CampaignTraffic"("customerId");

-- CreateIndex
CREATE INDEX "CampaignTraffic_createdAt_idx" ON "CampaignTraffic"("createdAt");

-- AddForeignKey
ALTER TABLE "CampaignTraffic" ADD CONSTRAINT "CampaignTraffic_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTraffic" ADD CONSTRAINT "CampaignTraffic_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "CampaignRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTraffic" ADD CONSTRAINT "CampaignTraffic_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
