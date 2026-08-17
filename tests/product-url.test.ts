import { describe, expect, it } from "vitest";
import { isStoreHome, productPageUrl, resolveProductLink } from "@/lib/catalogue/product-url";

describe("product page URLs", () => {
  it("builds the live product page from Neto ItemURL", () => {
    expect(productPageUrl({ ItemURL: "seat-belt-fitting-right-angle" })).toBe(
      "https://www.aveska.com.au/seat-belt-fitting-right-angle",
    );
  });

  it("ignores empty ProductURL and prefers ItemURL", () => {
    expect(productPageUrl({ ProductURL: "", ItemURL: "seat-belt-fitting-right-angle", URL: "" })).toBe(
      "https://www.aveska.com.au/seat-belt-fitting-right-angle",
    );
  });

  it("does not treat a product slug as the shop homepage", () => {
    expect(isStoreHome("https://www.aveska.com.au/seat-belt-fitting-right-angle", "https://aveska.com.au")).toBe(false);
    expect(isStoreHome("https://aveska.com.au", "https://aveska.com.au")).toBe(true);
    expect(resolveProductLink({ url: null }, "https://aveska.com.au")).toBe("https://aveska.com.au");
    expect(resolveProductLink({ url: "https://www.aveska.com.au/seat-belt-fitting-right-angle" }, "https://aveska.com.au")).toBe(
      "https://www.aveska.com.au/seat-belt-fitting-right-angle",
    );
  });
});
