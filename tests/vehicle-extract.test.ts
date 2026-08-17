import { describe, expect, it } from "vitest";
import { extractVehicle, canonicalVehicleName, isIdentifiedVehicle } from "@/lib/vehicle/extract";

describe("vehicle extraction", () => {
  it("extracts Ford XB/XC sedan seat belts", () => {
    const result = extractVehicle({
      name: "Front Bucket Seat Belts to suit Ford XB XC Sedan - Pair",
    });
    expect(result.make).toBe("Ford");
    expect(result.vehicleFamily).toBe("Falcon");
    expect(result.series).toEqual(expect.arrayContaining(["XB", "XC"]));
    expect(result.bodyType).toBe("Sedan");
    expect(result.productType).toBe("Seat Belts");
    expect(result.confidence).toBeGreaterThan(0.85);
    expect(canonicalVehicleName(result)).toContain("Ford");
  });

  it("extracts the vehicle, not the product, from a starter motor title", () => {
    const result = extractVehicle({
      name: "Volkswagen Starter Motor For Volkswagen Transporter T4 Manual 1999-04 ACV 2.5L Diesel Wagon",
    });
    expect(result.make).toBe("Volkswagen");
    expect(result.vehicleFamily).toBe("Transporter");
    expect(result.series).toEqual(["T4"]);
    expect(result.variant).toBe("Manual");
    expect(result.yearFrom).toBe(1999);
    expect(result.yearTo).toBe(2004);
    expect(result.engineCode).toBe("ACV");
    expect(result.engine).toBe("2.5L Diesel");
    expect(result.bodyType).toBe("Wagon");
    expect(result.productType).toBe("Starter Motor");
    expect(canonicalVehicleName(result)).toBe(
      "Volkswagen Transporter T4 Manual 1999-04 ACV 2.5L Diesel Wagon",
    );
    expect(canonicalVehicleName(result)).not.toMatch(/starter/i);
  });

  it("does not let HTML descriptions override the vehicle in the product name", () => {
    const result = extractVehicle({
      name: "Starter Motor For Volkswagen Transporter T4 Manual 1999-04 ACV 2.5L Diesel Wagon",
      description:
        "<p>Suits Bosch</p><p>Starter Motor 12V 1.9KW 9TH CW</p><p>Suits: Volkswagen Caravelle, Transporter</p>",
      series: ["200"],
    });
    expect(result.series).toEqual(["T4"]);
    expect(canonicalVehicleName(result)).toBe(
      "Volkswagen Transporter T4 Manual 1999-04 ACV 2.5L Diesel Wagon",
    );
  });

  it("extracts Holden HQ HJ HX HZ rust panel", () => {
    const result = extractVehicle({
      name: "Holden HQ HJ HX HZ Right Front Guard Lower Rust Repair Panel",
    });
    expect(result.make).toBe("Holden");
    expect(result.series).toEqual(expect.arrayContaining(["HQ", "HJ", "HX", "HZ"]));
    expect(result.productType).toBe("Rust Repair Panel");
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it("extracts Toyota LandCruiser 75 Series", () => {
    const result = extractVehicle({
      name: "Toyota LandCruiser 75 Series Panel",
    });
    expect(result.make).toBe("Toyota");
    expect(result.vehicleFamily).toBe("LandCruiser");
    expect(result.series).toContain("75");
  });

  it("learns additional series from catalogue knowledge", () => {
    const result = extractVehicle(
      { name: "Custom bracket to suit ACME ZX9 Ute" },
      {
        makes: ["ACME"],
        families: [{ make: "ACME", family: "Roadster", aliases: ["roadster"] }],
        series: [{ make: "ACME", family: "Roadster", code: "ZX9" }],
        aliases: [],
      },
    );
    expect(result.make).toBe("ACME");
    expect(result.series).toContain("ZX9");
  });

  it("treats make plus series as an identified vehicle", () => {
    expect(isIdentifiedVehicle({ make: "Holden", series: ["EJ", "EH"], vehicleFamily: "Kingswood" })).toBe(true);
    expect(isIdentifiedVehicle({ make: "Nissan", series: [], vehicleFamily: null, model: null })).toBe(false);
    expect(isIdentifiedVehicle({ make: null, series: ["XB"], vehicleFamily: "Falcon" })).toBe(false);
  });
});
