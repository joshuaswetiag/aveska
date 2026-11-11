-- Re-importing an order CSV must not add the same line again.

ALTER TABLE "OrderItem" ADD COLUMN "sourceRowHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "OrderItem_orderId_sourceRowHash_key" ON "OrderItem"("orderId", "sourceRowHash");
