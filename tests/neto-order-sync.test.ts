import { describe, expect, it } from "vitest";
import { netoOrderDateFilters, parseOrderSyncRange } from "@/lib/catalogue/neto-orders";
import { orderShippingAmount } from "@/lib/orders/report";

describe("order sync date range", () => {
  it("accepts a single day and swaps reversed dates", () => {
    expect(parseOrderSyncRange({ from: "2026-08-17", to: "2026-08-17" })).toEqual({
      from: "2026-08-17",
      to: "2026-08-17",
    });
    expect(parseOrderSyncRange({ from: "2026-08-17" })).toEqual({
      from: "2026-08-17",
      to: "2026-08-17",
    });
    expect(parseOrderSyncRange({ from: "2026-08-17", to: "2026-07-19" })).toEqual({
      from: "2026-07-19",
      to: "2026-08-17",
    });
    expect(parseOrderSyncRange({})).toBeNull();
  });

  it("filters Neto by the UTC window for Sydney calendar days", () => {
    const filters = netoOrderDateFilters({ from: "2026-08-18", to: "2026-08-18" });
    expect(filters.placed).toEqual({
      DatePlacedFrom: "2026-08-17 14:00:00",
      DatePlacedTo: "2026-08-18 13:59:59",
    });
    expect(filters.updated).toEqual({
      DateUpdatedFrom: "2026-08-17 14:00:00",
      DateUpdatedTo: "2026-08-18 13:59:59",
    });
  });
});

describe("order shipping vs grand total", () => {
  it("uses Neto ShippingTotal when present", () => {
    expect(
      orderShippingAmount({
        originalData: { ShippingTotal: "10.60" },
        orderTotal: 50.2,
        items: [{ lineTotal: 39.6 }],
      }),
    ).toBe(10.6);
  });

  it("derives postage from order total minus product lines", () => {
    expect(
      orderShippingAmount({
        originalData: {},
        orderTotal: "50.2",
        items: [{ lineTotal: "39.6" }],
      }),
    ).toBe(10.6);
  });
});
