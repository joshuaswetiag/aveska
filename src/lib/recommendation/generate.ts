import { prisma } from "@/lib/db";
import { scoreRecommendation } from "@/lib/recommendation/score";
import type { FitmentProfile } from "@/types";
import { slugify } from "@/lib/utils";

function profileFromVehicle(vehicle: {
  make: string;
  model: string | null;
  vehicleFamily: string | null;
  series: string[];
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  application: string | null;
}): FitmentProfile {
  return {
    make: vehicle.make,
    model: vehicle.model,
    vehicleFamily: vehicle.vehicleFamily,
    series: vehicle.series,
    bodyType: vehicle.bodyType,
    yearFrom: vehicle.yearFrom,
    yearTo: vehicle.yearTo,
    application: vehicle.application,
  };
}

export async function generateRecommendations(options?: {
  customerId?: string;
  onProgress?: (done: number, total: number) => Promise<void>;
  skipSegments?: boolean;
  resume?: boolean;
}) {
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {},
  });
  const threshold = Number(settings.confidenceThreshold);
  const cooldown = settings.cooldownDays === 0 ? ("never" as const) : settings.cooldownDays;

  const products = await prisma.product.findMany({
    include: { fitments: true, overrides: true },
  });
  const productsByMake = new Map<string, typeof products>();
  const productsByVehicle = new Map<string, typeof products>();
  for (const product of products) {
    if (product.make) {
      const key = product.make.toLowerCase();
      const list = productsByMake.get(key) ?? [];
      list.push(product);
      productsByMake.set(key, list);
    }
    for (const fitment of product.fitments) {
      if (fitment.isNegative) continue;
      const list = productsByVehicle.get(fitment.vehicleId) ?? [];
      list.push(product);
      productsByVehicle.set(fitment.vehicleId, list);
    }
  }

  const customerWhere = options?.customerId
    ? { id: options.customerId }
    : {
        vehicles: { some: {} },
        ...(options?.resume ? { recommendations: { none: {} } } : {}),
      };
  const total = await prisma.customer.count({ where: customerWhere });
  await options?.onProgress?.(0, Math.max(total, 1));

  let done = 0;
  let created = 0;
  let cursor: string | undefined;
  let pending: Array<{
    customerId: string;
    productId: string;
    vehicleId: string;
    customerVehicleId: string;
    score: number;
    scoreRaw: number;
    matchLevel: "EXACT" | "SAME_SERIES" | "SAME_FAMILY" | "RELATED_APPLICATION" | "INSUFFICIENT_DATA";
    confidence: number;
    status: "GENERATED" | "NEEDS_REVIEW";
  }> = [];

  const flush = async () => {
    if (!pending.length) return;
    await prisma.recommendation.createMany({ data: pending, skipDuplicates: true });
    created += pending.length;
    pending = [];
  };

  for (;;) {
    const customers = await prisma.customer.findMany({
      where: customerWhere,
      take: 25,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: {
        vehicles: { include: { vehicle: true } },
        orders: {
          select: {
            orderDate: true,
            items: { select: { sku: true, productId: true, productName: true, category: true } },
          },
        },
      },
    });
    if (!customers.length) break;
    cursor = customers[customers.length - 1].id;

    for (const customer of customers) {
      const purchasedSkus = customer.orders.flatMap((order) =>
        order.items.map((item) => ({
          sku: item.sku ?? item.productName,
          purchasedAt: order.orderDate,
        })),
      );
      const purchasedProductIds = new Set(
        customer.orders.flatMap((o) => o.items.map((i) => i.productId).filter(Boolean) as string[]),
      );
      const purchasedTypes = customer.orders.flatMap((o) => o.items.map((i) => i.category).filter(Boolean)) as string[];

      for (const customerVehicle of customer.vehicles) {
        const customerProfile = profileFromVehicle(customerVehicle.vehicle);
        const make = customerVehicle.vehicle.make.toLowerCase();
        const seen = new Set<string>();
        const candidates = [
          ...(productsByMake.get(make) ?? []),
          ...(productsByVehicle.get(customerVehicle.vehicleId) ?? []),
        ];
        for (const product of candidates) {
          if (seen.has(product.id) || purchasedProductIds.has(product.id)) continue;
          seen.add(product.id);
          const explicitFitment = product.fitments.some(
            (f) => !f.isNegative && f.vehicleId === customerVehicle.vehicleId,
          );
          const negative = product.overrides.some((o) => !o.isCompatible) || product.fitments.some((f) => f.isNegative);
          const positiveOverride = product.overrides.some(
            (o) =>
              o.isCompatible &&
              (!o.make || o.make.toLowerCase() === customerVehicle.vehicle.make.toLowerCase()) &&
              (!o.series.length || o.series.some((s) => customerVehicle.vehicle.series.includes(s))),
          );

          const scored = scoreRecommendation({
            customer: customerProfile,
            product: {
              make: product.make,
              model: product.model,
              vehicleFamily: product.vehicleFamily,
              series: product.series,
              bodyType: product.bodyType,
              yearFrom: product.yearFrom,
              yearTo: product.yearTo,
              application: product.fitment,
              sku: product.sku,
              category: product.category,
              fitment: product.fitment,
              tags: product.tags,
              discontinued: product.discontinued,
              stockStatus: product.stockStatus,
              explicitCompatibility: explicitFitment || positiveOverride,
              negativeMatch: negative && !positiveOverride,
            },
            purchasedSkus,
            purchasedProductTypes: purchasedTypes,
            cooldownDays: cooldown,
            includeOutOfStock: settings.includeOutOfStock,
            reduceScoreSameFamily: settings.reduceScoreSameFamily,
            confidenceThreshold: threshold,
          });

          if (scored.matchLevel === "INSUFFICIENT_DATA" && !scored.eligible) continue;
          if (scored.score <= 0 && !scored.eligible) continue;

          pending.push({
            customerId: customer.id,
            productId: product.id,
            vehicleId: customerVehicle.vehicleId,
            customerVehicleId: customerVehicle.id,
            score: scored.score,
            scoreRaw: scored.scoreRaw,
            matchLevel: scored.matchLevel,
            confidence: scored.confidence,
            status: scored.eligible ? "GENERATED" : "NEEDS_REVIEW",
          });
          if (pending.length >= 400) await flush();
        }
      }
      done += 1;
      if (options?.onProgress) await options.onProgress(done, Math.max(total, 1));
    }
    await flush();
  }

  await flush();
  if (!options?.skipSegments && !options?.resume) await segmentCustomers();
  return { customers: total, recommendations: created };
}

export async function segmentCustomers() {
  const customers = await prisma.customer.findMany({
    include: {
      vehicles: { include: { vehicle: true } },
      orders: { include: { items: true } },
    },
  });

  for (const customer of customers) {
    const names: Array<{ name: string; type: string }> = [];
    for (const cv of customer.vehicles) {
      const v = cv.vehicle;
      const label = [v.make, v.series.join("/"), v.vehicleFamily].filter(Boolean).join(" ");
      if (label) names.push({ name: `${label} Customer`, type: "vehicle" });
    }
    const types = customer.orders.flatMap((o) => o.items.map((i) => i.category || i.productName));
    for (const type of types) {
      if (/seat belt/i.test(type)) names.push({ name: "Seat Belt Customer", type: "category" });
      if (/rust|repair panel/i.test(type)) names.push({ name: "Rust Repair Panel Customer", type: "category" });
      if (/alternator/i.test(type)) names.push({ name: "Denso Alternator Customer", type: "category" });
    }
    if (customer.vehicles.length > 1) names.push({ name: "Mixed Vehicle Customer", type: "mixed" });

    const uniqueNames = [...new Map(names.map((n) => [n.name, n])).values()];
    for (const item of uniqueNames) {
      const slug = slugify(item.name);
      const segment = await prisma.segment.upsert({
        where: { slug },
        update: { name: item.name, type: item.type },
        create: { slug, name: item.name, type: item.type },
      });
      await prisma.customerSegment.upsert({
        where: { customerId_segmentId: { customerId: customer.id, segmentId: segment.id } },
        update: {},
        create: { customerId: customer.id, segmentId: segment.id },
      });
    }
  }
}
