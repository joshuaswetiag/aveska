-- Money is stored as integer cents. Sessions can be revoked. Duplicate emails, SKUs, and order ids are collapsed before unique indexes.
-- D1 rejects TEMP tables, so the lookup tables are ordinary tables and are dropped at the end.
-- Run this migration and the new Worker back to back. Do not leave the old Worker writing dollars after this file converts them to cents.

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

DROP TABLE IF EXISTS "_aveska_customer_dup";
CREATE TABLE "_aveska_customer_dup" ("dropId" TEXT NOT NULL PRIMARY KEY, "keepId" TEXT NOT NULL);
INSERT INTO "_aveska_customer_dup" ("dropId", "keepId")
SELECT c."id", keeper."id"
FROM "Customer" c
JOIN "Customer" keeper ON keeper."emailNormalized" = c."emailNormalized"
WHERE c."emailNormalized" IS NOT NULL
  AND keeper."id" = (
    SELECT c2."id" FROM "Customer" c2
    WHERE c2."emailNormalized" = c."emailNormalized"
    ORDER BY c2."updatedAt" DESC, c2."createdAt" DESC, c2."id" DESC
    LIMIT 1
  )
  AND c."id" != keeper."id";

UPDATE "Customer" SET "isSuppressed" = 1
WHERE "id" IN (
  SELECT m."keepId" FROM "_aveska_customer_dup" m
  JOIN "Customer" dropped ON dropped."id" = m."dropId"
  WHERE dropped."isSuppressed" = 1
);

DROP TABLE IF EXISTS "_aveska_rank";
CREATE TABLE "_aveska_rank" ("id" TEXT NOT NULL PRIMARY KEY, "rn" INTEGER NOT NULL, "grp" TEXT NOT NULL DEFAULT '');
INSERT INTO "_aveska_rank" ("id", "rn")
SELECT r."id",
  ROW_NUMBER() OVER (
    PARTITION BY CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE r."customerId" END, r."productId", r."vehicleId"
    ORDER BY r."score" DESC, r."updatedAt" DESC, r."id" DESC
  )
FROM "Recommendation" r
LEFT JOIN "_aveska_customer_dup" m ON m."dropId" = r."customerId"
WHERE r."customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup")
   OR r."customerId" IN (SELECT "keepId" FROM "_aveska_customer_dup");
DELETE FROM "Recommendation" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";

INSERT INTO "_aveska_rank" ("id", "rn", "grp")
SELECT cv."id",
  ROW_NUMBER() OVER (
    PARTITION BY CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE cv."customerId" END, cv."vehicleId"
    ORDER BY cv."isPrimary" DESC, cv."updatedAt" DESC, cv."id" DESC
  ),
  (CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE cv."customerId" END) || '|' || cv."vehicleId"
FROM "CustomerVehicle" cv
LEFT JOIN "_aveska_customer_dup" m ON m."dropId" = cv."customerId"
WHERE cv."customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup")
   OR cv."customerId" IN (SELECT "keepId" FROM "_aveska_customer_dup");
UPDATE "Recommendation" SET "customerVehicleId" = (
  SELECT winner."id"
  FROM "_aveska_rank" loser
  JOIN "_aveska_rank" winner ON winner."grp" = loser."grp" AND winner."rn" = 1
  WHERE loser."rn" > 1 AND loser."id" = "Recommendation"."customerVehicleId"
)
WHERE "customerVehicleId" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "CustomerVehicle" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";

UPDATE "Order" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "Order"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");
UPDATE "CustomerVehicle" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "CustomerVehicle"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");
UPDATE "Recommendation" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "Recommendation"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");

INSERT INTO "_aveska_rank" ("id", "rn")
SELECT cs."customerId" || '|' || cs."segmentId",
  ROW_NUMBER() OVER (
    PARTITION BY CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE cs."customerId" END, cs."segmentId"
    ORDER BY cs."createdAt" ASC
  )
FROM "CustomerSegment" cs
LEFT JOIN "_aveska_customer_dup" m ON m."dropId" = cs."customerId"
WHERE cs."customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup")
   OR cs."customerId" IN (SELECT "keepId" FROM "_aveska_customer_dup");
DELETE FROM "CustomerSegment"
WHERE "customerId" || '|' || "segmentId" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";
UPDATE "CustomerSegment" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "CustomerSegment"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");

INSERT INTO "_aveska_rank" ("id", "rn", "grp")
SELECT cr."id",
  ROW_NUMBER() OVER (
    PARTITION BY cr."campaignId", CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE cr."customerId" END
    ORDER BY cr."sent" DESC, cr."unsubscribed" DESC, cr."revenue" DESC, cr."updatedAt" DESC, cr."id" DESC
  ),
  cr."campaignId" || '|' || (CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE cr."customerId" END)
FROM "CampaignRecipient" cr
LEFT JOIN "_aveska_customer_dup" m ON m."dropId" = cr."customerId"
WHERE cr."customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup")
   OR cr."customerId" IN (SELECT "keepId" FROM "_aveska_customer_dup");
UPDATE "CampaignTraffic" SET "recipientId" = (
  SELECT winner."id"
  FROM "_aveska_rank" loser
  JOIN "_aveska_rank" winner ON winner."grp" = loser."grp" AND winner."rn" = 1
  WHERE loser."rn" > 1 AND loser."id" = "CampaignTraffic"."recipientId"
)
WHERE "recipientId" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "CampaignRecipient" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";
UPDATE "CampaignRecipient" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "CampaignRecipient"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");
UPDATE "CampaignTraffic" SET "customerId" = (SELECT "keepId" FROM "_aveska_customer_dup" WHERE "dropId" = "CampaignTraffic"."customerId")
WHERE "customerId" IN (SELECT "dropId" FROM "_aveska_customer_dup");

DELETE FROM "Customer" WHERE "id" IN (SELECT "dropId" FROM "_aveska_customer_dup");

DROP TABLE IF EXISTS "_aveska_product_dup";
CREATE TABLE "_aveska_product_dup" ("dropId" TEXT NOT NULL PRIMARY KEY, "keepId" TEXT NOT NULL);
INSERT INTO "_aveska_product_dup" ("dropId", "keepId")
SELECT p."id", keeper."id"
FROM "Product" p
JOIN "Product" keeper ON keeper."skuNormalized" = p."skuNormalized"
WHERE p."skuNormalized" IS NOT NULL
  AND keeper."id" = (
    SELECT p2."id" FROM "Product" p2
    WHERE p2."skuNormalized" = p."skuNormalized"
    ORDER BY p2."updatedAt" DESC, p2."createdAt" DESC, p2."id" DESC
    LIMIT 1
  )
  AND p."id" != keeper."id";

INSERT INTO "_aveska_rank" ("id", "rn")
SELECT pf."id",
  ROW_NUMBER() OVER (
    PARTITION BY CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE pf."productId" END, pf."vehicleId", pf."isNegative"
    ORDER BY pf."confidence" DESC, pf."updatedAt" DESC, pf."id" DESC
  )
FROM "ProductFitment" pf
LEFT JOIN "_aveska_product_dup" m ON m."dropId" = pf."productId"
WHERE pf."productId" IN (SELECT "dropId" FROM "_aveska_product_dup")
   OR pf."productId" IN (SELECT "keepId" FROM "_aveska_product_dup");
DELETE FROM "ProductFitment" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";

INSERT INTO "_aveska_rank" ("id", "rn")
SELECT r."id",
  ROW_NUMBER() OVER (
    PARTITION BY r."customerId", CASE WHEN m."keepId" IS NOT NULL THEN m."keepId" ELSE r."productId" END, r."vehicleId"
    ORDER BY r."score" DESC, r."updatedAt" DESC, r."id" DESC
  )
FROM "Recommendation" r
LEFT JOIN "_aveska_product_dup" m ON m."dropId" = r."productId"
WHERE r."productId" IN (SELECT "dropId" FROM "_aveska_product_dup")
   OR r."productId" IN (SELECT "keepId" FROM "_aveska_product_dup");
DELETE FROM "Recommendation" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";

UPDATE "OrderItem" SET "productId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "OrderItem"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "_aveska_product_dup");
UPDATE "ProductFitment" SET "productId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "ProductFitment"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "_aveska_product_dup");
UPDATE "Recommendation" SET "productId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "Recommendation"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "_aveska_product_dup");
UPDATE "Recommendation" SET "purchasedProductId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "Recommendation"."purchasedProductId")
WHERE "purchasedProductId" IN (SELECT "dropId" FROM "_aveska_product_dup");
UPDATE "FitmentOverride" SET "productId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "FitmentOverride"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "_aveska_product_dup");
UPDATE "CampaignProduct" SET "productId" = (SELECT "keepId" FROM "_aveska_product_dup" WHERE "dropId" = "CampaignProduct"."productId")
WHERE "productId" IN (SELECT "dropId" FROM "_aveska_product_dup");
INSERT INTO "_aveska_rank" ("id", "rn")
SELECT cp."id",
  ROW_NUMBER() OVER (
    PARTITION BY cp."campaignId", cp."productId"
    ORDER BY CASE WHEN cp."recommendationId" IS NULL THEN 1 ELSE 0 END, cp."sortOrder" ASC, cp."id" ASC
  )
FROM "CampaignProduct" cp
WHERE cp."productId" IN (SELECT "keepId" FROM "_aveska_product_dup");
DELETE FROM "CampaignProduct" WHERE "id" IN (SELECT "id" FROM "_aveska_rank" WHERE "rn" > 1);
DELETE FROM "_aveska_rank";
DELETE FROM "Product" WHERE "id" IN (SELECT "dropId" FROM "_aveska_product_dup");

DROP TABLE IF EXISTS "_aveska_order_dup";
CREATE TABLE "_aveska_order_dup" ("dropId" TEXT NOT NULL PRIMARY KEY, "keepId" TEXT NOT NULL);
INSERT INTO "_aveska_order_dup" ("dropId", "keepId")
SELECT o."id", keeper."id"
FROM "Order" o
JOIN "Order" keeper ON keeper."externalId" = o."externalId"
WHERE o."externalId" IS NOT NULL
  AND keeper."id" = (
    SELECT o2."id" FROM "Order" o2
    WHERE o2."externalId" = o."externalId"
    ORDER BY o2."updatedAt" DESC, o2."createdAt" DESC, o2."id" DESC
    LIMIT 1
  )
  AND o."id" != keeper."id";

INSERT INTO "_aveska_rank" ("id", "rn")
SELECT dropped."id", 2
FROM "OrderItem" dropped
JOIN "_aveska_order_dup" m ON m."dropId" = dropped."orderId"
WHERE EXISTS (
  SELECT 1 FROM "OrderItem" kept
  WHERE kept."orderId" = m."keepId"
    AND COALESCE(kept."sku", '') = COALESCE(dropped."sku", '')
    AND kept."productName" = dropped."productName"
    AND kept."quantity" = dropped."quantity"
    AND COALESCE(kept."unitPrice", -1) = COALESCE(dropped."unitPrice", -1)
);
DELETE FROM "OrderItem" WHERE "id" IN (SELECT "id" FROM "_aveska_rank");
DELETE FROM "_aveska_rank";
UPDATE "OrderItem" SET "orderId" = (SELECT "keepId" FROM "_aveska_order_dup" WHERE "dropId" = "OrderItem"."orderId")
WHERE "orderId" IN (SELECT "dropId" FROM "_aveska_order_dup");
DELETE FROM "Order" WHERE "id" IN (SELECT "dropId" FROM "_aveska_order_dup");

UPDATE "Customer" SET
  "totalOrders" = (SELECT COUNT(*) FROM "Order" o WHERE o."customerId" = "Customer"."id"),
  "totalSpend" = (SELECT COALESCE(SUM(o."orderTotal"), 0) FROM "Order" o WHERE o."customerId" = "Customer"."id"),
  "averageOrderValue" = CASE
    WHEN (SELECT COUNT(*) FROM "Order" o WHERE o."customerId" = "Customer"."id") = 0 THEN 0
    ELSE CAST(ROUND(
      (SELECT COALESCE(SUM(o."orderTotal"), 0) FROM "Order" o WHERE o."customerId" = "Customer"."id") * 1.0
      / (SELECT COUNT(*) FROM "Order" o WHERE o."customerId" = "Customer"."id")
    ) AS INTEGER)
  END,
  "firstPurchaseAt" = (SELECT MIN(o."orderDate") FROM "Order" o WHERE o."customerId" = "Customer"."id"),
  "lastPurchaseAt" = (SELECT MAX(o."orderDate") FROM "Order" o WHERE o."customerId" = "Customer"."id"),
  "vehicleCount" = (SELECT COUNT(*) FROM "CustomerVehicle" cv WHERE cv."customerId" = "Customer"."id")
WHERE "id" IN (SELECT "keepId" FROM "_aveska_customer_dup");

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_emailNormalized_key" ON "Customer"("emailNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_skuNormalized_key" ON "Product"("skuNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "Order_externalId_key" ON "Order"("externalId");

DROP TABLE IF EXISTS "_aveska_rank";
DROP TABLE IF EXISTS "_aveska_customer_dup";
DROP TABLE IF EXISTS "_aveska_product_dup";
DROP TABLE IF EXISTS "_aveska_order_dup";
