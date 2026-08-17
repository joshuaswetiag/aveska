import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseSpreadsheet } from "@/lib/import/parse-file";
import { detectColumnMapping } from "@/lib/import/columns";

describe("spreadsheet import", () => {
  it("parses the sample orders fixture", () => {
    const buffer = readFileSync(path.join(process.cwd(), "fixtures/sample-orders.csv"));
    const parsed = parseSpreadsheet(buffer, "sample-orders.csv");
    expect(parsed.totalRows).toBe(3);
    expect(parsed.headers).toContain("Email");
    const mapping = detectColumnMapping(parsed.headers, "orders");
    expect(mapping.Email).toBe("email");
    expect(mapping["Product Name"]).toBe("product_name");
  });

  it("parses the sample catalogue fixture", () => {
    const buffer = readFileSync(path.join(process.cwd(), "fixtures/sample-catalogue.csv"));
    const parsed = parseSpreadsheet(buffer, "sample-catalogue.csv");
    expect(parsed.rows.some((row) => String(row["Product Name"]).includes("LandCruiser"))).toBe(true);
    const mapping = detectColumnMapping(parsed.headers, "catalogue");
    expect(mapping.SKU).toBe("sku");
    expect(mapping.Make).toBe("make");
  });
});
