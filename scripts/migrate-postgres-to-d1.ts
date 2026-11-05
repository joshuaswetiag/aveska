/**
 * One-off copy from Postgres into the current Prisma database (local SQLite or D1).
 *
 *   POSTGRES_URL=postgres://... npx tsx scripts/migrate-postgres-to-d1.ts
 *
 * Requires the `pg` package (`npm install pg`). Dates are written as JavaScript Date
 * values so the D1 adapter stores ISO text. Do not dump a Prisma SQLite file into D1:
 * that file stores dates as integer milliseconds, and mixing the two breaks date filters.
 * The suppression list is copied so unsubscribed addresses are not emailed again.
 */
import { prisma } from "../src/lib/db";

type QueryClient = {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<{ rows: Array<Record<string, unknown>> }>;
};

const TABLES = ["User", "Customer", "Vehicle", "Product", "Suppression", "Order", "OrderItem", "Campaign", "CampaignRecipient"] as const;

async function main() {
  const url = process.env.POSTGRES_URL?.trim();
  if (!url) throw new Error("Set POSTGRES_URL to the old Postgres database.");
  const pg = (await import("pg").catch(() => {
    throw new Error("Install pg first: npm install pg");
  })) as { Client: new (config: { connectionString: string }) => QueryClient };
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    for (const table of TABLES) {
      const { rows } = await client.query(`SELECT * FROM "${table}"`);
      const data = rows.map(normalizeRow);
      for (let index = 0; index < data.length; index += 80) {
        const chunk = data.slice(index, index + 80);
        await writeChunk(table, chunk);
      }
      console.log(`${table}: ${data.length}`);
    }
  } finally {
    await client.end();
    await prisma.$disconnect();
  }
}

async function writeChunk(table: (typeof TABLES)[number], data: Array<Record<string, unknown>>) {
  if (!data.length) return;
  const rows = data as never;
  if (table === "User") await prisma.user.createMany({ data: rows });
  else if (table === "Customer") await prisma.customer.createMany({ data: rows });
  else if (table === "Vehicle") await prisma.vehicle.createMany({ data: rows });
  else if (table === "Product") await prisma.product.createMany({ data: rows });
  else if (table === "Suppression") await prisma.suppression.createMany({ data: rows });
  else if (table === "Order") await prisma.order.createMany({ data: rows });
  else if (table === "OrderItem") await prisma.orderItem.createMany({ data: rows });
  else if (table === "Campaign") await prisma.campaign.createMany({ data: rows });
  else await prisma.campaignRecipient.createMany({ data: rows });
}

function normalizeRow(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "bigint") out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
