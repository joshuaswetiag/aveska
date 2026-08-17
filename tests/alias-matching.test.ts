import { describe, expect, it } from "vitest";
import { extractVehicle } from "@/lib/vehicle/extract";

describe("alias matching", () => {
  it("resolves admin aliases that are not in the bootstrap dictionary", () => {
    const result = extractVehicle(
      { name: "Repair panel for Zebra Q9" },
      {
        makes: ["ACME"],
        families: [{ make: "ACME", family: "Zebra", aliases: ["zebra"] }],
        series: [{ make: "ACME", family: "Zebra", code: "Q9" }],
        aliases: [{ alias: "Zebra Q9", make: "ACME", family: "Zebra", series: ["Q9"] }],
      },
    );
    expect(result.make).toBe("ACME");
    expect(result.vehicleFamily).toBe("Zebra");
    expect(result.series).toContain("Q9");
  });
});
