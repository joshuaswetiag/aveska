import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { extractVehicle } from "../src/lib/vehicle/extract";
import { upsertVehicleFromExtraction } from "../src/lib/vehicle/persist";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@aveska.local";
  const password = process.env.ADMIN_PASSWORD || "change-me";
  const passwordHash = await hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", name: "Aveska Admin" },
    create: { email, passwordHash, role: "ADMIN", name: "Aveska Admin" },
  });

  await prisma.user.upsert({
    where: { email: "marketing@aveska.local" },
    update: {},
    create: {
      email: "marketing@aveska.local",
      passwordHash: await hash("change-me", 12),
      role: "MARKETING",
      name: "Marketing",
    },
  });

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      shopUrl: "https://aveska.com.au",
      contactUrl: "https://aveska.com.au/contact",
      fromName: "Aveska",
      companyName: "Aveska",
    },
  });

  const catalogue = [
    {
      sku: "AV-XB-SB-001",
      name: "Front Bucket Seat Belts to suit Ford XB XC Sedan - Pair",
      url: "https://aveska.com.au/products/ford-xb-xc-seat-belts",
      category: "Seat Belts",
      price: 189,
      stockStatus: "IN_STOCK" as const,
      make: "Ford",
      series: ["XB", "XC"],
      bodyType: "Sedan",
    },
    {
      sku: "AV-XB-RQ-002",
      name: "Ford XB/XC Rear Quarter Repair Panel",
      url: "https://aveska.com.au/products/ford-xb-xc-rear-quarter",
      category: "Rust Repair Panels",
      price: 245,
      stockStatus: "IN_STOCK" as const,
      make: "Ford",
      series: ["XB", "XC"],
    },
    {
      sku: "AV-XB-FL-003",
      name: "Ford XB/XC Floor Repair Panel",
      url: "https://aveska.com.au/products/ford-xb-xc-floor-panel",
      category: "Floor Panels",
      price: 310,
      stockStatus: "IN_STOCK" as const,
      make: "Ford",
      series: ["XB", "XC"],
    },
    {
      sku: "AV-XB-RR-004",
      name: "Ford XB Rust Repair Panel",
      url: "https://aveska.com.au/products/ford-xb-rust-repair",
      category: "Rust Repair Panels",
      price: 165,
      stockStatus: "IN_STOCK" as const,
      make: "Ford",
      series: ["XB"],
    },
    {
      sku: "AV-LC75-005",
      name: "Toyota LandCruiser 75 Series Panel",
      url: "https://aveska.com.au/products/landcruiser-75-panel",
      category: "Body Panels",
      price: 420,
      stockStatus: "IN_STOCK" as const,
      make: "Toyota",
      series: ["75"],
      vehicleFamily: "LandCruiser",
    },
    {
      sku: "AV-HQ-RR-006",
      name: "Holden HQ HJ HX HZ Right Front Guard Lower Rust Repair Panel",
      url: "https://aveska.com.au/products/holden-hq-guard-repair",
      category: "Rust Repair Panels",
      price: 198,
      stockStatus: "IN_STOCK" as const,
      make: "Holden",
      series: ["HQ", "HJ", "HX", "HZ"],
    },
  ];

  for (const item of catalogue) {
    const existing = await prisma.product.findFirst({ where: { sku: item.sku } });
    const data = {
      ...item,
      nameRaw: item.name,
      searchableText: `${item.name} ${item.make} ${item.series.join(" ")}`.toLowerCase(),
    };
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data });
    const extraction = extractVehicle(item);
    const vehicle = await upsertVehicleFromExtraction(extraction);
    if (vehicle) {
      await prisma.productFitment.upsert({
        where: { productId_vehicleId_isNegative: { productId: product.id, vehicleId: vehicle.id, isNegative: false } },
        update: { confidence: extraction.confidence, source: "seed" },
        create: {
          productId: product.id,
          vehicleId: vehicle.id,
          source: "seed",
          confidence: extraction.confidence,
          matchLevel: "EXACT",
        },
      });
    }
  }

  console.log("Seed complete. Admin login:", email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
