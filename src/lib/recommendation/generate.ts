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
}) {
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {},
  });
  const threshold = Number(settings.confidenceThreshold);
  const cooldown = settings.cooldownDays === 0 ? ("never" as const) : settings.cooldownDays;

  const customers = await prisma.customer.findMany({
    where: options?.customerId ? { id: options.customerId } : undefined,
    include: {
      vehicles: { include: { vehicle: true } },
      orders: { include: { items: true } },
    },
  });

  const products = await prisma.product.findMany({
    include: { fitments: { include: { vehicle: true } }, overrides: true },
  });

  let done = 0;
  let created = 0;
  const total = customers.length;

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
    const purchasedTypes = customer.orders.flatMap((o) =>
      o.items.map((i) => i.category).filter(Boolean),
    ) as string[];

    for (const customerVehicle of customer.vehicles) {
      const customerProfile = profileFromVehicle(customerVehicle.vehicle);
      for (const product of products) {
        if (purchasedProductIds.has(product.id)) continue;

        const negative = product.overrides.some((o) => !o.isCompatible) || product.fitments.some((f) => f.isNegative);
        const positiveOverride = product.overrides.some(
          (o) =>
            o.isCompatible &&
            (!o.make || o.make.toLowerCase() === customerVehicle.vehicle.make.toLowerCase()) &&
            (!o.series.length || o.series.some((s) => customerVehicle.vehicle.series.includes(s))),
        );
        const explicitFitment = product.fitments.some(
          (f) => !f.isNegative && f.vehicleId === customerVehicle.vehicleId,
        );

        const productProfile: FitmentProfile = {
          make: product.make,
          model: product.model,
          vehicleFamily: product.vehicleFamily,
          series: product.series,
          bodyType: product.bodyType,
          yearFrom: product.yearFrom,
          yearTo: product.yearTo,
          application: product.fitment,
        };

        const scored = scoreRecommendation({
          customer: customerProfile,
          product: {
            ...productProfile,
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

        if (scored.matchLevel === "INSUFFICIENT_DATA" && !scored.eligible) {
          continue;
        }
        if (scored.score <= 0 && !scored.eligible) continue;

        const status = scored.eligible ? "GENERATED" : "NEEDS_REVIEW";
        const rec = await prisma.recommendation.upsert({
          where: {
            customerId_productId_vehicleId: {
              customerId: customer.id,
              productId: product.id,
              vehicleId: customerVehicle.vehicleId,
            },
          },
          update: {
            score: scored.score,
            scoreRaw: scored.scoreRaw,
            matchLevel: scored.matchLevel,
            confidence: scored.confidence,
            status,
            customerVehicleId: customerVehicle.id,
          },
          create: {
            customerId: customer.id,
            productId: product.id,
            vehicleId: customerVehicle.vehicleId,
            customerVehicleId: customerVehicle.id,
            score: scored.score,
            scoreRaw: scored.scoreRaw,
            matchLevel: scored.matchLevel,
            confidence: scored.confidence,
            status,
          },
        });
        await prisma.recommendationReason.deleteMany({ where: { recommendationId: rec.id } });
        if (scored.reasons.length) {
          await prisma.recommendationReason.createMany({
            data: scored.reasons.map((reason) => ({
              recommendationId: rec.id,
              code: reason.code,
              label: reason.label,
              points: reason.points,
            })),
          });
        }
        created += 1;
      }
    }
    done += 1;
    if (options?.onProgress) await options.onProgress(done, total);
  }

  await segmentCustomers();
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
