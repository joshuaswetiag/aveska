import { describe, expect, it } from "vitest";
import { netoOrderDateFilters, parseOrderSyncRange } from "@/lib/catalogue/neto-orders";

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

  it("filters Neto by Sydney calendar days for placed and updated orders", () => {
    const filters = netoOrderDateFilters({ from: "2026-08-17", to: "2026-08-17" });
    expect(filters.placed).toEqual({
      DatePlacedFrom: "2026-08-16 14:00:00",
      DatePlacedTo: "2026-08-17 13:59:59",
    });
    expect(filters.updated).toEqual({
      DateUpdatedFrom: "2026-08-16 14:00:00",
      DateUpdatedTo: "2026-08-17 13:59:59",
    });
  });
});
