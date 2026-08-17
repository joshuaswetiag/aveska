import { readFileSync } from "fs";
import { backfillCustomerVehiclesFromOrders } from "../src/lib/vehicle/persist";
import { getCrossSellOpportunities } from "../src/lib/campaign/opportunities";
import { getDataQuality } from "../src/lib/data-quality";

function loadEnv() {
  const text = readFileSync(".env", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

async function main() {
  console.log("Checking opportunities + data quality…");
  const opportunities = await getCrossSellOpportunities(5);
  console.log(
    "opportunities",
    opportunities.map((row) => ({ name: row.name, customers: row.customers, eligible: row.eligible })),
  );
  const quality = await getDataQuality();
  console.log(
    "quality",
    quality.totals,
    quality.cards.map((card) => ({ label: card.label, value: card.value, total: card.total })),
  );
  console.log("Backfilling customer vehicles…");
  const result = await backfillCustomerVehiclesFromOrders(async (done, total, message) => {
    if (done === 0 || done === total || done % 2000 === 0) {
      console.log(message ?? `${done}/${total}`);
    }
  });
  console.log("backfill", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
