-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MARKETING', 'READONLY');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('ORDERS', 'CATALOGUE', 'SUPPRESSION', 'VEHICLE_ALIASES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'MAPPING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('IMPORT', 'EXTRACT_VEHICLES', 'GENERATE_RECOMMENDATIONS', 'GENERATE_CAMPAIGN', 'SEGMENT_CUSTOMERS', 'ANALYSE_CUSTOMERS', 'DEMO');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'UNKNOWN', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('GENERATED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'INCORRECT_FITMENT', 'NOT_RELEVANT', 'ALREADY_PURCHASED', 'EXCELLENT_MATCH');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('CROSS_SELL', 'VEHICLE_RESTORATION', 'RELATED_PRODUCTS', 'RE_ENGAGEMENT', 'NEW_PRODUCT', 'CATEGORY_PROMOTION', 'SEASONAL', 'CLEARANCE', 'BACK_IN_STOCK', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'EXPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBED', 'BOUNCED', 'INVALID', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "MatchLevel" AS ENUM ('EXACT', 'SAME_SERIES', 'SAME_FAMILY', 'RELATED_APPLICATION', 'INSUFFICIENT_DATA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'READONLY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "averageOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "firstPurchaseAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "vehicleCount" INTEGER NOT NULL DEFAULT 0,
    "mainVehicleId" TEXT,
    "mainCategory" TEXT,
    "isSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "originalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3),
    "orderTotal" DECIMAL(12,2),
    "sourceRowHash" TEXT,
    "importJobId" TEXT,
    "originalData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "productName" TEXT NOT NULL,
    "productNameRaw" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),
    "lineTotal" DECIMAL(12,2),
    "productUrl" TEXT,
    "category" TEXT,
    "extractedVehicle" JSONB,
    "extractionConfidence" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "skuNormalized" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "description" TEXT,
    "descriptionRaw" TEXT,
    "url" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "brand" TEXT,
    "price" DECIMAL(12,2),
    "stock" INTEGER,
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "make" TEXT,
    "model" TEXT,
    "vehicleFamily" TEXT,
    "series" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bodyType" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "engine" TEXT,
    "fitment" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "searchableText" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "originalData" JSONB,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT,
    "vehicleFamily" TEXT,
    "series" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generation" TEXT,
    "bodyType" TEXT,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "engine" TEXT,
    "engineCode" TEXT,
    "variant" TEXT,
    "driveType" TEXT,
    "application" TEXT,
    "canonicalName" TEXT NOT NULL,
    "searchableText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleAlias" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFitment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "matchLevel" "MatchLevel" NOT NULL,
    "notes" TEXT,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FitmentOverride" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "series" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vehicleFamily" TEXT,
    "bodyType" TEXT,
    "isCompatible" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FitmentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVehicle" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "source" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "mergedFromIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "customerVehicleId" TEXT,
    "productId" TEXT NOT NULL,
    "purchasedProductId" TEXT,
    "score" DECIMAL(5,2) NOT NULL,
    "scoreRaw" DECIMAL(8,2) NOT NULL,
    "matchLevel" "MatchLevel" NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'GENERATED',
    "feedbackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationReason" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSegment" (
    "customerId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("customerId","segmentId")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL DEFAULT 'CROSS_SELL',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "targetSegmentId" TEXT,
    "vehicleFilter" TEXT,
    "subject" TEXT,
    "preheader" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "fromName" TEXT,
    "replyTo" TEXT,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "utmSource" TEXT NOT NULL DEFAULT 'email',
    "utmMedium" TEXT NOT NULL DEFAULT 'email',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "exportedAt" TIMESTAMP(3),
    "sent" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "converted" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleLabel" TEXT,
    "purchasedProduct" TEXT,
    "subject" TEXT,
    "preheader" TEXT,
    "bodyHtml" TEXT,
    "personalized" JSONB,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "opened" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "bounced" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "bodyHtml" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "columnMapping" JSONB,
    "detectedColumns" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "missingEmail" INTEGER NOT NULL DEFAULT 0,
    "missingProduct" INTEGER NOT NULL DEFAULT 0,
    "summary" JSONB,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRowError" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "field" TEXT,
    "message" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRowError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "payload" JSONB,
    "result" JSONB,
    "errorMessage" TEXT,
    "importJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "cooldownDays" INTEGER NOT NULL DEFAULT 90,
    "confidenceThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.85,
    "includeOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "utmEnabled" BOOLEAN NOT NULL DEFAULT true,
    "shopUrl" TEXT,
    "contactUrl" TEXT,
    "fromName" TEXT NOT NULL DEFAULT 'Aveska',
    "replyTo" TEXT,
    "companyName" TEXT NOT NULL DEFAULT 'Aveska',
    "logoUrl" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "reduceScoreSameFamily" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_emailNormalized_idx" ON "Customer"("emailNormalized");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_externalId_idx" ON "Customer"("externalId");

-- CreateIndex
CREATE INDEX "Customer_lastPurchaseAt_idx" ON "Customer"("lastPurchaseAt");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_orderDate_idx" ON "Order"("orderDate");

-- CreateIndex
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");

-- CreateIndex
CREATE INDEX "Order_sourceRowHash_idx" ON "Order"("sourceRowHash");

-- CreateIndex
CREATE INDEX "Order_importJobId_idx" ON "Order"("importJobId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderItem_sku_idx" ON "OrderItem"("sku");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_skuNormalized_idx" ON "Product"("skuNormalized");

-- CreateIndex
CREATE INDEX "Product_externalId_idx" ON "Product"("externalId");

-- CreateIndex
CREATE INDEX "Product_make_idx" ON "Product"("make");

-- CreateIndex
CREATE INDEX "Product_model_idx" ON "Product"("model");

-- CreateIndex
CREATE INDEX "Product_vehicleFamily_idx" ON "Product"("vehicleFamily");

-- CreateIndex
CREATE INDEX "Product_stockStatus_idx" ON "Product"("stockStatus");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_discontinued_idx" ON "Product"("discontinued");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_canonicalName_key" ON "Vehicle"("canonicalName");

-- CreateIndex
CREATE INDEX "Vehicle_make_idx" ON "Vehicle"("make");

-- CreateIndex
CREATE INDEX "Vehicle_model_idx" ON "Vehicle"("model");

-- CreateIndex
CREATE INDEX "Vehicle_vehicleFamily_idx" ON "Vehicle"("vehicleFamily");

-- CreateIndex
CREATE INDEX "Vehicle_canonicalName_idx" ON "Vehicle"("canonicalName");

-- CreateIndex
CREATE INDEX "VehicleAlias_aliasNormalized_idx" ON "VehicleAlias"("aliasNormalized");

-- CreateIndex
CREATE INDEX "VehicleAlias_vehicleId_idx" ON "VehicleAlias"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleAlias_aliasNormalized_key" ON "VehicleAlias"("aliasNormalized");

-- CreateIndex
CREATE INDEX "ProductFitment_productId_idx" ON "ProductFitment"("productId");

-- CreateIndex
CREATE INDEX "ProductFitment_vehicleId_idx" ON "ProductFitment"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductFitment_productId_vehicleId_isNegative_key" ON "ProductFitment"("productId", "vehicleId", "isNegative");

-- CreateIndex
CREATE INDEX "FitmentOverride_productId_idx" ON "FitmentOverride"("productId");

-- CreateIndex
CREATE INDEX "CustomerVehicle_customerId_idx" ON "CustomerVehicle"("customerId");

-- CreateIndex
CREATE INDEX "CustomerVehicle_vehicleId_idx" ON "CustomerVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerVehicle_customerId_vehicleId_key" ON "CustomerVehicle"("customerId", "vehicleId");

-- CreateIndex
CREATE INDEX "Recommendation_customerId_idx" ON "Recommendation"("customerId");

-- CreateIndex
CREATE INDEX "Recommendation_vehicleId_idx" ON "Recommendation"("vehicleId");

-- CreateIndex
CREATE INDEX "Recommendation_productId_idx" ON "Recommendation"("productId");

-- CreateIndex
CREATE INDEX "Recommendation_status_idx" ON "Recommendation"("status");

-- CreateIndex
CREATE INDEX "Recommendation_score_idx" ON "Recommendation"("score");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_customerId_productId_vehicleId_key" ON "Recommendation"("customerId", "productId", "vehicleId");

-- CreateIndex
CREATE INDEX "RecommendationReason_recommendationId_idx" ON "RecommendationReason"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_slug_key" ON "Segment"("slug");

-- CreateIndex
CREATE INDEX "CustomerSegment_segmentId_idx" ON "CustomerSegment"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_type_idx" ON "Campaign"("type");

-- CreateIndex
CREATE INDEX "Campaign_slug_idx" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "CampaignRecipient_campaignId_idx" ON "CampaignRecipient"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_customerId_idx" ON "CampaignRecipient"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_customerId_key" ON "CampaignRecipient"("campaignId", "customerId");

-- CreateIndex
CREATE INDEX "CampaignProduct_campaignId_idx" ON "CampaignProduct"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_slug_key" ON "EmailTemplate"("slug");

-- CreateIndex
CREATE INDEX "Suppression_emailNormalized_idx" ON "Suppression"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_emailNormalized_reason_key" ON "Suppression"("emailNormalized", "reason");

-- CreateIndex
CREATE INDEX "ImportJob_type_idx" ON "ImportJob"("type");

-- CreateIndex
CREATE INDEX "ImportJob_status_idx" ON "ImportJob"("status");

-- CreateIndex
CREATE INDEX "ImportRowError_importJobId_idx" ON "ImportRowError"("importJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_importJobId_key" ON "Job"("importJobId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleAlias" ADD CONSTRAINT "VehicleAlias_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFitment" ADD CONSTRAINT "ProductFitment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFitment" ADD CONSTRAINT "ProductFitment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FitmentOverride" ADD CONSTRAINT "FitmentOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_customerVehicleId_fkey" FOREIGN KEY ("customerVehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationReason" ADD CONSTRAINT "RecommendationReason_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowError" ADD CONSTRAINT "ImportRowError_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

