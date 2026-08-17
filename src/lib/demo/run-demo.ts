import { prisma } from "@/lib/db";
import { extractVehicle } from "@/lib/vehicle/extract";
import { upsertVehicleFromExtraction } from "@/lib/vehicle/persist";
import { generateRecommendations } from "@/lib/recommendation/generate";
import { generateCampaign } from "@/lib/campaign/generate";

const CATALOGUE = [
  {
    sku: "AV-XB-SB-001",
    name: "Front Bucket Seat Belts to suit Ford XB XC Sedan - Pair",
    url: "https://aveska.com.au/products/ford-xb-xc-seat-belts",
    category: "Seat Belts",
    price: 189.0,
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
    price: 245.0,
    stockStatus: "IN_STOCK" as const,
    make: "Ford",
    series: ["XB", "XC"],
  },
  {
    sku: "AV-XB-FL-003",
    name: "Ford XB/XC Floor Repair Panel",
    url: "https://aveska.com.au/products/ford-xb-xc-floor-panel",
    category: "Floor Panels",
    price: 310.0,
    stockStatus: "IN_STOCK" as const,
    make: "Ford",
    series: ["XB", "XC"],
  },
  {
    sku: "AV-XB-RR-004",
    name: "Ford XB Rust Repair Panel",
    url: "https://aveska.com.au/products/ford-xb-rust-repair",
    category: "Rust Repair Panels",
    price: 165.0,
    stockStatus: "IN_STOCK" as const,
    make: "Ford",
    series: ["XB"],
  },
  {
    sku: "AV-LC75-005",
    name: "Toyota LandCruiser 75 Series Panel",
    url: "https://aveska.com.au/products/landcruiser-75-panel",
    category: "Body Panels",
    price: 420.0,
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
    price: 198.0,
    stockStatus: "IN_STOCK" as const,
    make: "Holden",
    series: ["HQ", "HJ", "HX", "HZ"],
  },
];

export async function runDemo(onProgress?: (done: number, total: number, message?: string) => Promise<void>) {
  await onProgress?.(1, 6, "Creating demo catalogue");
  for (const item of CATALOGUE) {
    const existing = await prisma.product.findFirst({ where: { sku: item.sku } });
    const extraction = extractVehicle(item);
    const data = {
      ...item,
      nameRaw: item.name,
      searchableText: `${item.name} ${item.make} ${item.series.join(" ")}`.toLowerCase(),
      vehicleFamily: item.vehicleFamily ?? extraction.vehicleFamily,
      originalData: item as object,
    };
    if (existing) await prisma.product.update({ where: { id: existing.id }, data });
    else await prisma.product.create({ data });
    await upsertVehicleFromExtraction(extraction);
  }

  await onProgress?.(2, 6, "Creating demo customer");
  let customer = await prisma.customer.findFirst({ where: { emailNormalized: "john@example.com" } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: "John Smith",
        firstName: "John",
        lastName: "Smith",
        email: "john@example.com",
        emailNormalized: "john@example.com",
      },
    });
  } else {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: { name: "John Smith", firstName: "John", lastName: "Smith" },
    });
  }

  const product = await prisma.product.findFirstOrThrow({ where: { sku: "AV-XB-SB-001" } });
  const existingOrder = await prisma.order.findFirst({ where: { customerId: customer.id, externalId: "DEMO-1001" } });
  if (!existingOrder) {
    await prisma.order.create({
      data: {
        externalId: "DEMO-1001",
        customerId: customer.id,
        orderDate: new Date(),
        orderTotal: 189,
        items: {
          create: {
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            productNameRaw: product.name,
            quantity: 1,
            unitPrice: 189,
            category: product.category,
          },
        },
      },
    });
  }

  await onProgress?.(3, 6, "Extracting vehicles");
  const { extractCatalogueFitments, extractOrderVehicles } = await import("@/lib/vehicle/persist");
  await extractCatalogueFitments();
  await extractOrderVehicles();

  await onProgress?.(4, 6, "Generating recommendations");
  await generateRecommendations({ customerId: customer.id });

  await onProgress?.(5, 6, "Generating campaign");
  const campaign = await generateCampaign({
    name: "Demo Ford XB/XC Cross-Sell",
    customerIds: [customer.id],
    type: "CROSS_SELL",
  });

  await onProgress?.(6, 6, "Demo ready");
  return { customerId: customer.id, campaignId: campaign.id };
}
