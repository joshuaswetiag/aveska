import { readFileSync } from "node:fs";

type SqliteStatement = { all: () => unknown[]; get: () => unknown };
type SqliteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

async function openDatabase(): Promise<SqliteDatabase> {
  const specifier = "node:sqlite";
  const sqlite = (await import(specifier)) as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new sqlite.DatabaseSync(":memory:");
}
import { describe, expect, it } from "vitest";
import { unsignedUnsubscribeStillValid, unsubscribeToken, validUnsubscribeToken } from "@/lib/campaign/unsubscribe-token";

const root = process.cwd();

describe("integrity migration", () => {
  it("does not use temporary tables", () => {
    const sql = readFileSync(`${root}/migrations/0002_integrity.sql`, "utf8");
    expect(sql.toUpperCase()).not.toContain("CREATE TEMP");
    expect(sql).toContain('DROP TABLE IF EXISTS "_aveska_customer_dup"');
  });

  it("merges three copies without doubling lines or dropping a sent recipient", async () => {
    const db = await openDatabase();
    db.exec(readFileSync(`${root}/migrations/0001_init.sql`, "utf8"));
    db.exec(`
      INSERT INTO "Vehicle" ("id", "make", "canonicalName", "searchableText", "updatedAt")
      VALUES ('v1', 'Ford', 'Ford XB', 'ford xb', '2024-01-01');
      INSERT INTO "Customer" ("id", "name", "emailNormalized", "isSuppressed", "updatedAt") VALUES
        ('c-old', 'Old', 'a@b.com', 0, '2020-01-01'),
        ('c-mid', 'Mid', 'a@b.com', 0, '2021-01-01'),
        ('c-new', 'New', 'a@b.com', 0, '2024-01-01');
      INSERT INTO "CustomerVehicle" ("id", "customerId", "vehicleId", "confidence", "source", "updatedAt") VALUES
        ('cv-old', 'c-old', 'v1', 1, 'import', '2020-01-01'),
        ('cv-mid', 'c-mid', 'v1', 1, 'import', '2021-01-01');
      INSERT INTO "Order" ("id", "externalId", "customerId", "orderTotal", "updatedAt") VALUES
        ('o-old', 'EXT', 'c-old', 10.50, '2020-01-01'),
        ('o-new', 'EXT', 'c-mid', 30.75, '2021-01-01');
      INSERT INTO "OrderItem" ("id", "orderId", "productName", "productNameRaw", "sku", "quantity", "unitPrice", "updatedAt") VALUES
        ('i-old', 'o-old', 'Belt', 'Belt', 'SKU', 1, 189, '2020-01-01'),
        ('i-new', 'o-new', 'Belt', 'Belt', 'SKU', 1, 189, '2021-01-01'),
        ('i-new-2', 'o-new', 'Belt', 'Belt', 'SKU', 1, 189, '2021-01-02');
      INSERT INTO "Campaign" ("id", "name", "slug", "updatedAt") VALUES ('camp', 'Camp', 'camp', '2024-01-01');
      INSERT INTO "CampaignRecipient" ("id", "campaignId", "customerId", "sent", "updatedAt") VALUES
        ('r-old', 'camp', 'c-old', 1, '2020-01-01'),
        ('r-new', 'camp', 'c-new', 0, '2024-01-01');
      INSERT INTO "CampaignTraffic" ("id", "campaignId", "recipientId", "customerId", "type")
      VALUES ('t1', 'camp', 'r-old', 'c-old', 'OPEN');
    `);
    db.exec(readFileSync(`${root}/migrations/0002_integrity.sql`, "utf8"));

    const customers = db.prepare(`SELECT "id", "isSuppressed" FROM "Customer"`).all() as Array<{ id: string; isSuppressed: number }>;
    expect(customers).toEqual([{ id: "c-new", isSuppressed: 0 }]);
    const vehicles = db.prepare(`SELECT COUNT(*) AS n FROM "CustomerVehicle"`).get() as { n: number };
    expect(vehicles.n).toBe(1);
    const lines = db.prepare(`SELECT COUNT(*) AS n FROM "OrderItem"`).get() as { n: number };
    expect(lines.n).toBe(2);
    const totals = db.prepare(`SELECT "totalOrders" AS orders, "totalSpend" AS spend FROM "Customer"`).get() as { orders: number; spend: number };
    expect(totals).toEqual({ orders: 1, spend: 3075 });
    const recipient = db.prepare(`SELECT "customerId", "sent" FROM "CampaignRecipient"`).get() as { customerId: string; sent: number };
    expect(recipient).toEqual({ customerId: "c-new", sent: 1 });
    const traffic = db.prepare(`SELECT "recipientId", "customerId" FROM "CampaignTraffic"`).get() as { recipientId: string; customerId: string };
    expect(traffic.customerId).toBe("c-new");
    expect(traffic.recipientId).toBe("r-old");
    db.close();
  });
});

describe("unsubscribe token", () => {
  it("rejects a missing or swapped token", () => {
    const token = unsubscribeToken("recipient-1");
    expect(validUnsubscribeToken("recipient-1", token)).toBe(true);
    expect(validUnsubscribeToken("recipient-1", "nope")).toBe(false);
    expect(validUnsubscribeToken("recipient-2", token)).toBe(false);
  });

  it("accepts an unsigned link only for mail sent before signatures", () => {
    expect(unsignedUnsubscribeStillValid("2026-11-01T00:00:00.000Z")).toBe(true);
    expect(unsignedUnsubscribeStillValid("2026-11-12T00:00:00.000Z")).toBe(false);
    expect(unsignedUnsubscribeStillValid(null)).toBe(false);
  });
});
