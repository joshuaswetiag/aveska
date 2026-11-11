-- Recalculate customer totals after duplicate orders have been merged.
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
  "vehicleCount" = (SELECT COUNT(*) FROM "CustomerVehicle" cv WHERE cv."customerId" = "Customer"."id");
