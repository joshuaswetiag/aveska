import { readFileSync } from "fs";
import { syncNetoProductUrls } from "../src/lib/catalogue/neto";
import { refreshCampaignProductLinks } from "../src/lib/campaign/repair-product-links";

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
  const synced = await syncNetoProductUrls(async (done, total, message) => {
    if (done === 0 || done === total || done % 500 === 0) console.log(message ?? `${done}/${total}`);
  });
  console.log("synced", synced);
  const repaired = await refreshCampaignProductLinks();
  console.log("repaired campaigns", repaired);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
