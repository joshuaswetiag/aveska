import { describe, expect, it } from "vitest";
import { detectColumnMapping, applyMapping, mappingIssues } from "@/lib/import/columns";

describe("column mapping", () => {
  it("detects order columns with variant names", () => {
    const mapping = detectColumnMapping(
      ["Customer Name", "Email Address", "Order Date", "SKU", "Product Title", "Qty"],
      "orders",
    );
    expect(mapping["Email Address"]).toBe("email");
    expect(mapping["Product Title"]).toBe("product_name");
    expect(mapping["SKU"]).toBe("sku");
    expect(mappingIssues(mapping, "orders")).toEqual([]);
  });

  it("applies mapping to a row", () => {
    const mapped = applyMapping(
      { "Email Address": "john@example.com", "Product Title": "Seat Belts" },
      { "Email Address": "email", "Product Title": "product_name" },
    );
    expect(mapped.email).toBe("john@example.com");
    expect(mapped.product_name).toBe("Seat Belts");
  });
});
