import { readFileSync } from "fs";
import { parseOrderSyncRange, syncNetoOrders } from "../src/lib/catalogue/neto-orders";

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

const range = parseOrderSyncRange({ from: process.argv[2], to: process.argv[3] ?? process.argv[2] });

syncNetoOrders(async (done, _total, message) => {
  if (done % 100 === 0) {
    console.log(message ?? `${done} orders`);
  }
}, range ?? undefined)
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Neto order sync failed");
    process.exit(1);
  });
