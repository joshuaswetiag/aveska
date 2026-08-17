import { prisma } from "@/lib/db";
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

type CountRow = { count: number };
type VehicleRow = {
  total: number;
  not_processed: number;
  identified: number;
  high_confidence: number;
  low_confidence: number;
  no_vehicle: number;
};
type SampleRow = { productName: string; vehicle: string | null; confidence: number | null };
type DupRow = { key: string; count: number };

function n(value: unknown) {
  return Number(value ?? 0);
}

export async function getDataQuality(): Promise<{
  cards: QualityCard[];
  totals: { customers: number; orderLines: number; products: number; vehicles: number };
}> {
  const [customers, orderLines, products, vehicles] = await Promise.all([
    prisma.customer.count(),
    prisma.orderItem.count(),
    prisma.product.count(),
    prisma.vehicle.count(),
  ]);

  const [vehicleStats] = await prisma.$queryRaw<VehicleRow[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "extractedVehicle" IS NULL)::int AS not_processed,
      COUNT(*) FILTER (
        WHERE COALESCE("extractedVehicle"->>'make', '') <> ''
          AND (
            (
              jsonb_typeof("extractedVehicle"->'series') = 'array'
              AND jsonb_array_length("extractedVehicle"->'series') > 0
            )
            OR COALESCE("extractedVehicle"->>'vehicleFamily', '') <> ''
            OR COALESCE("extractedVehicle"->>'model', '') <> ''
          )
      )::int AS identified,
      COUNT(*) FILTER (
        WHERE COALESCE("extractedVehicle"->>'make', '') <> ''
          AND (
            (
              jsonb_typeof("extractedVehicle"->'series') = 'array'
              AND jsonb_array_length("extractedVehicle"->'series') > 0
            )
            OR COALESCE("extractedVehicle"->>'vehicleFamily', '') <> ''
            OR COALESCE("extractedVehicle"->>'model', '') <> ''
          )
          AND COALESCE("extractionConfidence", 0) >= 0.85
      )::int AS high_confidence,
      COUNT(*) FILTER (
        WHERE COALESCE("extractedVehicle"->>'make', '') <> ''
          AND (
            (
              jsonb_typeof("extractedVehicle"->'series') = 'array'
              AND jsonb_array_length("extractedVehicle"->'series') > 0
            )
            OR COALESCE("extractedVehicle"->>'vehicleFamily', '') <> ''
            OR COALESCE("extractedVehicle"->>'model', '') <> ''
          )
          AND COALESCE("extractionConfidence", 0) < 0.85
      )::int AS low_confidence,
      COUNT(*) FILTER (
        WHERE "extractedVehicle" IS NOT NULL
          AND (
            COALESCE("extractedVehicle"->>'make', '') = ''
            OR (
              NOT (
                jsonb_typeof("extractedVehicle"->'series') = 'array'
                AND jsonb_array_length("extractedVehicle"->'series') > 0
              )
              AND COALESCE("extractedVehicle"->>'vehicleFamily', '') = ''
              AND COALESCE("extractedVehicle"->>'model', '') = ''
            )
          )
      )::int AS no_vehicle
    FROM "OrderItem"
  `;

  const [missingEmail] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS count
    FROM "Customer"
    WHERE email IS NULL OR "emailNormalized" IS NULL OR BTRIM(email) = ''
  `;
  const [customersWithoutVehicle] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS count
    FROM "Customer" c
    WHERE NOT EXISTS (SELECT 1 FROM "CustomerVehicle" cv WHERE cv."customerId" = c.id)
  `;
  const [missingProductName] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS count
    FROM "OrderItem"
    WHERE BTRIM("productName") = ''
  `;
  const duplicateEmails = await prisma.$queryRaw<DupRow[]>`
    SELECT "emailNormalized" AS key, COUNT(*)::int AS count
    FROM "Customer"
    WHERE "emailNormalized" IS NOT NULL
    GROUP BY "emailNormalized"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `;
  const duplicateSkus = await prisma.$queryRaw<DupRow[]>`
    SELECT "skuNormalized" AS key, COUNT(*)::int AS count
    FROM "Product"
    WHERE "skuNormalized" IS NOT NULL
    GROUP BY "skuNormalized"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 8
  `;
  const [dupEmailCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "Customer"
      WHERE "emailNormalized" IS NOT NULL
      GROUP BY "emailNormalized"
      HAVING COUNT(*) > 1
    ) AS d
  `;
  const [dupSkuCount] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::int AS count FROM (
      SELECT 1 FROM "Product"
      WHERE "skuNormalized" IS NOT NULL
      GROUP BY "skuNormalized"
      HAVING COUNT(*) > 1
    ) AS d
  `;

  const noVehicleSamples = await prisma.$queryRaw<SampleRow[]>`
    SELECT "productName",
      NULLIF("extractedVehicle"->>'application', '') AS vehicle,
      "extractionConfidence"::float AS confidence
    FROM "OrderItem"
    WHERE "extractedVehicle" IS NOT NULL
      AND (
        COALESCE("extractedVehicle"->>'make', '') = ''
        OR (
          NOT (
            jsonb_typeof("extractedVehicle"->'series') = 'array'
            AND jsonb_array_length("extractedVehicle"->'series') > 0
          )
          AND COALESCE("extractedVehicle"->>'vehicleFamily', '') = ''
          AND COALESCE("extractedVehicle"->>'model', '') = ''
        )
      )
    ORDER BY "createdAt" DESC
    LIMIT 6
  `;
  const lowConfidenceSamples = await prisma.$queryRaw<SampleRow[]>`
    SELECT "productName",
      NULLIF("extractedVehicle"->>'application', '') AS vehicle,
      "extractionConfidence"::float AS confidence
    FROM "OrderItem"
    WHERE COALESCE("extractedVehicle"->>'make', '') <> ''
      AND (
        (
          jsonb_typeof("extractedVehicle"->'series') = 'array'
          AND jsonb_array_length("extractedVehicle"->'series') > 0
        )
        OR COALESCE("extractedVehicle"->>'vehicleFamily', '') <> ''
        OR COALESCE("extractedVehicle"->>'model', '') <> ''
      )
      AND COALESCE("extractionConfidence", 0) < 0.85
    ORDER BY "extractionConfidence" ASC
    LIMIT 6
  `;
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

  const identified = n(vehicleStats?.identified);
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
      value: n(vehicleStats?.no_vehicle) + n(vehicleStats?.not_processed),
      total: orderLines,
      href: "/orders",
      hint: "Generic accessories or lines the extractor could not match to a vehicle.",
      samples: noVehicleSamples.map((row) => ({ label: row.productName, detail: row.vehicle })),
    },
    {
      label: "Low-confidence vehicle matches",
      value: n(vehicleStats?.low_confidence),
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
      value: n(missingEmail?.count),
      total: customers,
      href: "/customers",
      hint: "Cannot be included in campaign export until an email is added.",
      samples: missingEmailSamples.map((row) => ({ label: row.name, detail: row.email })),
    },
    {
      label: "Customers without a vehicle",
      value: n(customersWithoutVehicle?.count),
      total: customers,
      href: "/opportunities",
      hint: "No linked vehicle from order extraction. Cross-sell grouping needs a vehicle.",
      samples: [],
    },
    {
      label: "Missing product name",
      value: n(missingProductName?.count),
      total: orderLines,
      href: "/orders",
      hint: "Order lines with a blank product title.",
      samples: missingNameSamples.map((row) => ({ label: row.sku ?? "No SKU", detail: row.productNameRaw })),
    },
    {
      label: "Duplicate customer emails",
      value: n(dupEmailCount?.count),
      href: "/customers",
      hint: "Same normalised email on more than one customer record.",
      samples: duplicateEmails.map((row) => ({ label: row.key, detail: `${row.count} records` })),
    },
    {
      label: "Duplicate SKUs",
      value: n(dupSkuCount?.count),
      href: "/products",
      hint: "Same normalised SKU on more than one catalogue product.",
      samples: duplicateSkus.map((row) => ({ label: row.key, detail: `${row.count} products` })),
    },
  ];

  return {
    cards,
    totals: { customers, orderLines, products, vehicles },
  };
}
