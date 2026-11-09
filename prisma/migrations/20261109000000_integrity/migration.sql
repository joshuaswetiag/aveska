-- Money is stored as integer cents. Sessions can be revoked. Duplicate emails, SKUs, and order ids are collapsed before unique indexes.

CREATE TABLE IF NOT EXISTS "_aveska_meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

UPDATE "Customer" SET "totalSpend" = CAST(ROUND("totalSpend" * 100) AS INTEGER), "averageOrderValue" = CAST(ROUND("averageOrderValue" * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "Order" SET "orderTotal" = CAST(ROUND("orderTotal" * 100) AS INTEGER)
WHERE "orderTotal" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "OrderItem" SET "unitPrice" = CAST(ROUND("unitPrice" * 100) AS INTEGER)
WHERE "unitPrice" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "OrderItem" SET "lineTotal" = CAST(ROUND("lineTotal" * 100) AS INTEGER)
WHERE "lineTotal" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "Product" SET "price" = CAST(ROUND("price" * 100) AS INTEGER)
WHERE "price" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "Campaign" SET "revenue" = CAST(ROUND("revenue" * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
UPDATE "CampaignRecipient" SET "revenue" = CAST(ROUND("revenue" * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM "_aveska_meta" WHERE "key" = 'money_unit' AND "value" = 'cents');
INSERT INTO "_aveska_meta" ("key", "value") VALUES ('money_unit', 'cents')
ON CONFLICT("key") DO UPDATE SET "value" = 'cents';

ALTER TABLE "Settings" ADD COLUMN "campaignFrequencyDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

UPDATE "Customer" SET "emailNormalized" = NULL WHERE "emailNormalized" IS NOT NULL AND length(trim("emailNormalized")) = 0;
UPDATE "Product" SET "skuNormalized" = NULL WHERE "skuNormalized" IS NOT NULL AND length(trim("skuNormalized")) = 0;
UPDATE "Order" SET "externalId" = NULL WHERE "externalId" IS NOT NULL AND length(trim("externalId")) = 0;

CREATE TEMP TABLE "customer_dup_map" AS
SELECT c."id" AS "dropId", keeper."id" AS "keepId"
FROM "Customer" c
JOIN "Customer" keeper ON keeper."emailNormalized" = c."emailNormalized"
WHERE c."emailNormalized" IS NOT NULL
  AND keeper."id" = (
    SELECT c2."id" FROM "Customer" c2
    WHERE c2."emailNormalized" = c."emailNormalized"
    ORDER BY c2."createdAt" ASC, c2."id" ASC
    LIMIT 1
  )
  AND c."id" != keeper."id";

UPDATE "Order" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "Order"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

DELETE FROM "CustomerVehicle"
WHERE "id" IN (
  SELECT cv."id" FROM "CustomerVehicle" cv
  JOIN "customer_dup_map" m ON m."dropId" = cv."customerId"
  WHERE EXISTS (
    SELECT 1 FROM "CustomerVehicle" keep
    WHERE keep."customerId" = m."keepId" AND keep."vehicleId" = cv."vehicleId"
  )
);
UPDATE "CustomerVehicle" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "CustomerVehicle"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

DELETE FROM "Recommendation"
WHERE "id" IN (
  SELECT r."id" FROM "Recommendation" r
  JOIN "customer_dup_map" m ON m."dropId" = r."customerId"
  WHERE EXISTS (
    SELECT 1 FROM "Recommendation" k
    WHERE k."customerId" = m."keepId" AND k."productId" = r."productId" AND k."vehicleId" = r."vehicleId"
  )
);
UPDATE "Recommendation" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "Recommendation"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

DELETE FROM "CustomerSegment"
WHERE "customerId" IN (
  SELECT cs."customerId" FROM "CustomerSegment" cs
  JOIN "customer_dup_map" m ON m."dropId" = cs."customerId"
  WHERE EXISTS (
    SELECT 1 FROM "CustomerSegment" keep
    WHERE keep."customerId" = m."keepId" AND keep."segmentId" = cs."segmentId"
  )
);
UPDATE "CustomerSegment" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "CustomerSegment"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

DELETE FROM "CampaignRecipient"
WHERE "id" IN (
  SELECT cr."id" FROM "CampaignRecipient" cr
  JOIN "customer_dup_map" m ON m."dropId" = cr."customerId"
  WHERE EXISTS (
    SELECT 1 FROM "CampaignRecipient" keep
    WHERE keep."campaignId" = cr."campaignId" AND keep."customerId" = m."keepId"
  )
);
UPDATE "CampaignRecipient" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "CampaignRecipient"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

UPDATE "CampaignTraffic" SET "customerId" = (SELECT "keepId" FROM "customer_dup_map" WHERE "dropId" = "CampaignTraffic"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "customer_dup_map");

DELETE FROM "Customer" WHERE "id" IN (SELECT "dropId" FROM "customer_dup_map");

CREATE TEMP TABLE "product_dup_map" AS
SELECT p."id" AS "dropId", keeper."id" AS "keepId"
FROM "Product" p
JOIN "Product" keeper ON keeper."skuNormalized" = p."skuNormalized"
WHERE p."skuNormalized" IS NOT NULL
  AND keeper."id" = (
    SELECT p2."id" FROM "Product" p2
    WHERE p2."skuNormalized" = p."skuNormalized"
    ORDER BY p2."createdAt" ASC, p2."id" ASC
    LIMIT 1
  )
  AND p."id" != keeper."id";

UPDATE "OrderItem" SET "productId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "OrderItem"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "product_dup_map");

DELETE FROM "ProductFitment"
WHERE "id" IN (
  SELECT pf."id" FROM "ProductFitment" pf
  JOIN "product_dup_map" m ON m."dropId" = pf."productId"
  WHERE EXISTS (
    SELECT 1 FROM "ProductFitment" keep
    WHERE keep."productId" = m."keepId" AND keep."vehicleId" = pf."vehicleId" AND keep."isNegative" = pf."isNegative"
  )
);
UPDATE "ProductFitment" SET "productId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "ProductFitment"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "product_dup_map");

DELETE FROM "Recommendation"
WHERE "id" IN (
  SELECT r."id" FROM "Recommendation" r
  JOIN "product_dup_map" m ON m."dropId" = r."productId"
  WHERE EXISTS (
    SELECT 1 FROM "Recommendation" k
    WHERE k."customerId" = r."customerId" AND k."productId" = m."keepId" AND k."vehicleId" = r."vehicleId"
  )
);
UPDATE "Recommendation" SET "productId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "Recommendation"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "product_dup_map");
UPDATE "Recommendation" SET "purchasedProductId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "Recommendation"."purchasedProductId")
WHERE "purchasedProductId" IN (SELECT "dropId" FROM "product_dup_map");

UPDATE "FitmentOverride" SET "productId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "FitmentOverride"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "product_dup_map");
UPDATE "CampaignProduct" SET "productId" = (SELECT "keepId" FROM "product_dup_map" WHERE "dropId" = "CampaignProduct"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "product_dup_map");

DELETE FROM "Product" WHERE "id" IN (SELECT "dropId" FROM "product_dup_map");

CREATE TEMP TABLE "order_dup_map" AS
SELECT o."id" AS "dropId", keeper."id" AS "keepId"
FROM "Order" o
JOIN "Order" keeper ON keeper."externalId" = o."externalId"
WHERE o."externalId" IS NOT NULL
  AND keeper."id" = (
    SELECT o2."id" FROM "Order" o2
    WHERE o2."externalId" = o."externalId"
    ORDER BY o2."createdAt" ASC, o2."id" ASC
    LIMIT 1
  )
  AND o."id" != keeper."id";

UPDATE "OrderItem" SET "orderId" = (SELECT "keepId" FROM "order_dup_map" WHERE "dropId" = "OrderItem"."orderId")
WHERE "orderId" IN (SELECT "dropId" FROM "order_dup_map");
DELETE FROM "Order" WHERE "id" IN (SELECT "dropId" FROM "order_dup_map");

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_emailNormalized_key" ON "Customer"("emailNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_skuNormalized_key" ON "Product"("skuNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_externalId_key" ON "Order"("externalId");
