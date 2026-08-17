import { readFileSync } from "fs";
import { extractCatalogueFitments, extractOrderVehicles } from "../src/lib/vehicle/persist";

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
  console.log("Rebuilding vehicle names from product titles…");
  await extractCatalogueFitments(async (done, total) => {
    if (done % 200 === 0 || done === total) {
      console.log(`Catalogue ${done} / ${total}`);
    }
  });
  await extractOrderVehicles(async (done, total) => {
    if (done % 200 === 0 || done === total) {
      console.log(`Orders ${done} / ${total}`);
    }
  });
  console.log("Vehicle rebuild complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
