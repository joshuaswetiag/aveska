import { prisma } from "@/lib/db";

export type OpportunityGroup = {
  name: string;
  make: string | null;
  vehicleId: string | null;
  customers: number;
  eligible: number;
  orderLines: number;
  potentialProducts: number;
};

type RawGroup = {
  name: string;
  make: string | null;
  customers: number;
  eligible: number;
  order_lines: number;
};

export async function getCrossSellOpportunities(limit = 80): Promise<OpportunityGroup[]> {
  const rows = await prisma.$queryRaw<RawGroup[]>`
    SELECT
      COALESCE(NULLIF(oi."extractedVehicle"->>'application', ''), 'Unknown vehicle') AS name,
      NULLIF(oi."extractedVehicle"->>'make', '') AS make,
      COUNT(DISTINCT o."customerId")::int AS customers,
      COUNT(DISTINCT c.id) FILTER (
        WHERE c."isSuppressed" = false AND c."emailNormalized" IS NOT NULL
      )::int AS eligible,
      COUNT(*)::int AS order_lines
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE COALESCE(oi."extractedVehicle"->>'make', '') <> ''
      AND (
        (
          jsonb_typeof(oi."extractedVehicle"->'series') = 'array'
          AND jsonb_array_length(oi."extractedVehicle"->'series') > 0
        )
        OR COALESCE(oi."extractedVehicle"->>'vehicleFamily', '') <> ''
        OR COALESCE(oi."extractedVehicle"->>'model', '') <> ''
      )
      AND COALESCE(oi."extractionConfidence", 0) >= 0.5
    GROUP BY 1, 2
    ORDER BY COUNT(DISTINCT o."customerId") DESC
    LIMIT ${limit}
  `;

  const names = rows.map((row) => row.name).filter(Boolean);
  const vehicles = names.length
    ? await prisma.vehicle.findMany({
        where: { canonicalName: { in: names } },
        select: {
          id: true,
          canonicalName: true,
          _count: { select: { fitments: { where: { isNegative: false } } } },
        },
      })
    : [];
  const byName = new Map(vehicles.map((vehicle) => [vehicle.canonicalName, vehicle]));

  return rows.map((row) => {
    const vehicle = byName.get(row.name);
    return {
      name: row.name,
      make: row.make,
      vehicleId: vehicle?.id ?? null,
      customers: row.customers,
      eligible: row.eligible,
      orderLines: row.order_lines,
      potentialProducts: vehicle?._count.fitments ?? 0,
    };
  });
}
