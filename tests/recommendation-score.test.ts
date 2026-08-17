import { describe, expect, it } from "vitest";
import { scoreRecommendation } from "@/lib/recommendation/score";

const fordCustomer = {
  make: "Ford",
  model: "Falcon",
  vehicleFamily: "Falcon",
  series: ["XB", "XC"],
  bodyType: "Sedan",
  yearFrom: null,
  yearTo: null,
  application: "Ford Falcon XB/XC Sedan",
};

describe("recommendation scoring", () => {
  it("scores exact Ford XB/XC match highly", () => {
    const result = scoreRecommendation({
      customer: fordCustomer,
      product: {
        make: "Ford",
        model: "Falcon",
        vehicleFamily: "Falcon",
        series: ["XB", "XC"],
        bodyType: "Sedan",
        yearFrom: null,
        yearTo: null,
        application: "Ford XB/XC Sedan Rear Quarter Repair Panel",
        sku: "AV-XB-RQ-002",
        fitment: "Ford XB/XC Sedan Rear Quarter Repair Panel",
        stockStatus: "IN_STOCK",
        explicitCompatibility: true,
      },
    });
    expect(result.eligible).toBe(true);
    expect(result.matchLevel).toBe("EXACT");
    expect(result.score).toBeGreaterThan(70);
    expect(result.reasons.some((r) => r.code === "make")).toBe(true);
    expect(result.reasons.some((r) => r.code === "series_exact" || r.code === "series")).toBe(true);
  });

  it("does not recommend Toyota parts to a Ford customer", () => {
    const result = scoreRecommendation({
      customer: fordCustomer,
      product: {
        make: "Toyota",
        model: "LandCruiser",
        vehicleFamily: "LandCruiser",
        series: ["75"],
        bodyType: null,
        yearFrom: null,
        yearTo: null,
        application: "Toyota LandCruiser 75 Series Panel",
        sku: "AV-LC75-005",
        stockStatus: "IN_STOCK",
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toMatch(/incompatible/i);
  });

  it("does not recommend category-only products", () => {
    const result = scoreRecommendation({
      customer: fordCustomer,
      product: {
        make: null,
        model: null,
        vehicleFamily: null,
        series: [],
        bodyType: null,
        yearFrom: null,
        yearTo: null,
        application: null,
        category: "Seat Belts",
        sku: "GENERIC-BELT",
        stockStatus: "IN_STOCK",
      },
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toBe("Insufficient fitment data");
  });

  it("excludes recently purchased SKUs", () => {
    const result = scoreRecommendation({
      customer: fordCustomer,
      product: {
        ...fordCustomer,
        sku: "AV-XB-SB-001",
        stockStatus: "IN_STOCK",
        explicitCompatibility: true,
      },
      purchasedSkus: [{ sku: "AV-XB-SB-001", purchasedAt: new Date() }],
      cooldownDays: 90,
    });
    expect(result.eligible).toBe(false);
    expect(result.exclusionReason).toMatch(/cooldown/i);
  });

  it("excludes out of stock by default", () => {
    const result = scoreRecommendation({
      customer: fordCustomer,
      product: {
        ...fordCustomer,
        sku: "AV-XB-RR-004",
        stockStatus: "OUT_OF_STOCK",
        explicitCompatibility: true,
      },
    });
    expect(result.eligible).toBe(false);
  });
});
