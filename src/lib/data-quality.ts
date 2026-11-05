import { prisma } from "@/lib/db";
import { asStringArray } from "@/lib/json-array";
import { formatPercent } from "@/lib/utils";

export type QualitySample = {
  label: string;
  detail?: string | null;
};

export type QualityCard = {
  label: string;
  value: number;
  total?: number;
  href: string;
  hint: string;
  samples: QualitySample[];
};

type ExtractedVehicle = {
  make?: string | null;
  model?: string | null;
  vehicleFamily?: string | null;
  series?: unknown;
  application?: string | null;
};

function hasVehicleSignal(extracted: ExtractedVehicle | null | undefined) {
  if (!extracted) return false;
  const make = (extracted.make ?? "").trim();
  if (!make) return false;
  return (
    asStringArray(extracted.series).length > 0 ||
    Boolean((extracted.vehicleFamily ?? "").trim()) ||
    Boolean((extracted.model ?? "").trim())
  );
}

function isNoVehicle(extracted: ExtractedVehicle | null | undefined) {
  if (!extracted) return true;
  const make = (extracted.make ?? "").trim();
  if (!make) return true;
  return (
    asStringArray(extracted.series).length === 0 &&
    !(extracted.vehicleFamily ?? "").trim() &&
    !(extracted.model ?? "").trim()
  );
}

export async function getDataQuality(): Promise<{
  cards: QualityCard[];
  totals: { customers: number; orderLines: number; products: number; vehicles: number };
}> {
  const [customers, orderLines, products, vehicles, orderItems, missingEmail, customersWithoutVehicle, missingProductName] =
    await Promise.all([
      prisma.customer.count(),
      prisma.orderItem.count(),
      prisma.product.count(),
      prisma.vehicle.count(),
      prisma.orderItem.findMany({
        select: { productName: true, extractedVehicle: true, extractionConfidence: true, createdAt: true },
      }),
      prisma.customer.count({
        where: { OR: [{ email: null }, { emailNormalized: null }, { email: "" }] },
      }),
      prisma.customer.count({ where: { vehicles: { none: {} } } }),
      prisma.orderItem.count({ where: { productName: "" } }),
    ]);

  let notProcessed = 0;
  let identified = 0;
  let highConfidence = 0;
  let lowConfidence = 0;
  let noVehicle = 0;
  const noVehicleSamples: Array<{ productName: string; vehicle: string | null; confidence: number | null }> = [];
  const lowConfidenceSamples: Array<{ productName: string; vehicle: string | null; confidence: number | null }> = [];

  for (const item of orderItems) {
    const extracted = item.extractedVehicle as ExtractedVehicle | null;
    const confidence = item.extractionConfidence == null ? 0 : Number(item.extractionConfidence);
    if (extracted == null) {
      notProcessed += 1;
      continue;
    }
    if (isNoVehicle(extracted)) {
      noVehicle += 1;
      if (noVehicleSamples.length < 6) {
        noVehicleSamples.push({
          productName: item.productName,
          vehicle: extracted.application ?? null,
          confidence,
        });
      }
      continue;
    }
    if (hasVehicleSignal(extracted)) {
      identified += 1;
      if (confidence >= 0.85) highConfidence += 1;
      else {
        lowConfidence += 1;
        if (lowConfidenceSamples.length < 6) {
          lowConfidenceSamples.push({
            productName: item.productName,
            vehicle: extracted.application ?? null,
            confidence,
          });
        }
      }
    }
  }

  const emailGroups = await prisma.customer.groupBy({
    by: ["emailNormalized"],
    where: { emailNormalized: { not: null } },
    _count: { _all: true },
    having: { emailNormalized: { _count: { gt: 1 } } },
    orderBy: { _count: { emailNormalized: "desc" } },
    take: 8,
  });
  const skuGroups = await prisma.product.groupBy({
    by: ["skuNormalized"],
    where: { skuNormalized: { not: null } },
    _count: { _all: true },
    having: { skuNormalized: { _count: { gt: 1 } } },
    orderBy: { _count: { skuNormalized: "desc" } },
    take: 8,
  });

  const missingEmailSamples = await prisma.customer.findMany({
    where: { OR: [{ email: null }, { emailNormalized: null }, { email: "" }] },
    select: { name: true, email: true },
    take: 6,
  });
  const missingNameSamples = await prisma.orderItem.findMany({
    where: { productName: { equals: "" } },
    select: { sku: true, productNameRaw: true },
    take: 6,
  });

  void highConfidence;
  const cards: QualityCard[] = [
    {
      label: "Vehicle identified on orders",
      value: identified,
      total: orderLines,
      href: "/orders",
      hint: `${formatPercent(orderLines ? identified / orderLines : 0)} of order lines have a make plus series or family.`,
      samples: [],
    },
    {
      label: "No vehicle on order line",
      value: noVehicle + notProcessed,
      total: orderLines,
      href: "/orders",
      hint: "Generic accessories or lines the extractor could not match to a vehicle.",
      samples: noVehicleSamples.map((row) => ({ label: row.productName, detail: row.vehicle })),
    },
    {
      label: "Low-confidence vehicle matches",
      value: lowConfidence,
      total: identified,
      href: "/orders",
      hint: "Vehicle was found, but confidence is below 0.85. These are not counted as missing.",
      samples: lowConfidenceSamples.map((row) => ({
        label: row.productName,
        detail: `${row.vehicle ?? "—"} · ${row.confidence ?? 0}`,
      })),
    },
    {
      label: "Customers missing email",
      value: missingEmail,
      total: customers,
      href: "/customers",
      hint: "Cannot be included in campaign export until an email is added.",
      samples: missingEmailSamples.map((row) => ({ label: row.name, detail: row.email })),
    },
    {
      label: "Customers without a vehicle",
      value: customersWithoutVehicle,
      total: customers,
      href: "/opportunities",
      hint: "No linked vehicle from order extraction. Cross-sell grouping needs a vehicle.",
      samples: [],
    },
    {
      label: "Missing product name",
      value: missingProductName,
      total: orderLines,
      href: "/orders",
      hint: "Order lines with a blank product title.",
      samples: missingNameSamples.map((row) => ({ label: row.sku ?? "No SKU", detail: row.productNameRaw })),
    },
    {
      label: "Duplicate customer emails",
      value: emailGroups.length,
      href: "/customers",
      hint: "Same normalised email on more than one customer record.",
      samples: emailGroups.map((row) => ({
        label: row.emailNormalized ?? "—",
        detail: `${row._count._all} records`,
      })),
    },
    {
      label: "Duplicate SKUs",
      value: skuGroups.length,
      href: "/products",
      hint: "Same normalised SKU on more than one catalogue product.",
      samples: skuGroups.map((row) => ({
        label: row.skuNormalized ?? "—",
        detail: `${row._count._all} products`,
      })),
    },
  ];

  return {
    cards,
    totals: { customers, orderLines, products, vehicles },
  };
}
