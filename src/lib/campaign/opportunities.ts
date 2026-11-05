import { prisma } from "@/lib/db";
import { asStringArray } from "@/lib/json-array";

export type OpportunityGroup = {
  name: string;
  make: string | null;
  vehicleId: string | null;
  customers: number;
  eligible: number;
  orderLines: number;
  potentialProducts: number;
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

export async function getCrossSellOpportunities(limit = 80): Promise<OpportunityGroup[]> {
  const items = await prisma.orderItem.findMany({
    where: { extractionConfidence: { gte: 0.5 } },
    select: {
      extractedVehicle: true,
      order: {
        select: {
          customerId: true,
          customer: { select: { id: true, isSuppressed: true, emailNormalized: true } },
        },
      },
    },
  });

  type Acc = { make: string | null; customers: Set<string>; eligible: Set<string>; orderLines: number };
  const groups = new Map<string, Acc>();

  for (const item of items) {
    const extracted = item.extractedVehicle as ExtractedVehicle | null;
    if (!hasVehicleSignal(extracted)) continue;
    const name = (extracted?.application ?? "").trim() || "Unknown vehicle";
    const make = (extracted?.make ?? "").trim() || null;
    const key = `${make ?? ""}|${name}`;
    let group = groups.get(key);
    if (!group) {
      group = { make, customers: new Set(), eligible: new Set(), orderLines: 0 };
      groups.set(key, group);
    }
    group.orderLines += 1;
    const customerId = item.order.customerId;
    group.customers.add(customerId);
    const customer = item.order.customer;
    if (!customer.isSuppressed && customer.emailNormalized) group.eligible.add(customer.id);
  }

  const rows = [...groups.entries()]
    .map(([key, group]) => ({
      name: key.slice(key.indexOf("|") + 1),
      make: group.make,
      customers: group.customers.size,
      eligible: group.eligible.size,
      order_lines: group.orderLines,
    }))
    .sort((a, b) => b.customers - a.customers)
    .slice(0, limit);

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
