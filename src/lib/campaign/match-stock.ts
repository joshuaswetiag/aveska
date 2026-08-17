import { prisma } from "@/lib/db";
import { canonicalVehicleName, extractVehicle } from "@/lib/vehicle/extract";
import { scoreRecommendation } from "@/lib/recommendation/score";
import type { FitmentProfile, VehicleExtraction } from "@/types";
import type { StockStatus } from "@prisma/client";

export type StockMatch = {
  productId: string;
  name: string;
  sku: string | null;
  url: string | null;
  imageUrl: string | null;
  price: number | null;
  score: number;
  matchLevel: string;
};

type StockProduct = {
  id: string;
  name: string;
  sku: string | null;
  url: string | null;
  imageUrl: string | null;
  price: unknown;
  make: string | null;
  model: string | null;
  vehicleFamily: string | null;
  series: string[];
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  fitment: string | null;
  category: string | null;
  tags: string[];
  discontinued: boolean;
  stockStatus: StockStatus;
  fitments: Array<{
    isNegative: boolean;
    vehicleId: string;
    vehicle: { id: string; make: string; series: string[] };
  }>;
  overrides: Array<{ isCompatible: boolean; make: string | null; series: string[] }>;
};

function profileFromExtraction(extraction: VehicleExtraction): FitmentProfile {
  return {
    make: extraction.make,
    model: extraction.model,
    vehicleFamily: extraction.vehicleFamily,
    series: extraction.series,
    bodyType: extraction.bodyType,
    yearFrom: extraction.yearFrom,
    yearTo: extraction.yearTo,
    application: extraction.application,
  };
}

export function vehicleFromOrderItem(item: {
  productName: string;
  sku?: string | null;
  extractedVehicle: unknown;
  product?: {
    make?: string | null;
    series?: string[];
    fitment?: string | null;
    bodyType?: string | null;
    vehicleFamily?: string | null;
    fitments?: Array<{ isNegative: boolean; vehicle: { make: string; model: string | null; vehicleFamily: string | null; series: string[]; bodyType: string | null; yearFrom: number | null; yearTo: number | null; application: string | null; canonicalName: string } }>;
  } | null;
}): { profile: FitmentProfile; label: string } | null {
  const extracted = item.extractedVehicle as VehicleExtraction | null;
  if (extracted?.make) {
    const label = canonicalVehicleName(extracted);
    if (label) return { profile: profileFromExtraction(extracted), label };
  }
  const fitment = item.product?.fitments?.find((row) => !row.isNegative)?.vehicle;
  if (fitment) {
    return {
      profile: {
        make: fitment.make,
        model: fitment.model,
        vehicleFamily: fitment.vehicleFamily,
        series: fitment.series,
        bodyType: fitment.bodyType,
        yearFrom: fitment.yearFrom,
        yearTo: fitment.yearTo,
        application: fitment.application,
      },
      label: fitment.canonicalName,
    };
  }
  const fallback = extractVehicle({
    name: item.productName,
    sku: item.sku,
    make: item.product?.make,
    series: item.product?.series,
    fitment: item.product?.fitment,
    bodyType: item.product?.bodyType,
  });
  if (!fallback.make) return null;
  const label = canonicalVehicleName(fallback);
  return label ? { profile: profileFromExtraction(fallback), label } : null;
}

export function vehicleCacheKey(profile: FitmentProfile): string {
  return [
    profile.make,
    profile.vehicleFamily ?? profile.model,
    (profile.series ?? []).join("/"),
    profile.bodyType,
    profile.yearFrom,
    profile.yearTo,
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

export async function loadStockProducts(includeOutOfStock: boolean) {
  return prisma.product.findMany({
    where: {
      discontinued: false,
      stockStatus: includeOutOfStock ? { not: "DISCONTINUED" } : "IN_STOCK",
    },
    include: {
      fitments: { include: { vehicle: true } },
      overrides: true,
    },
  });
}

export function matchStockForVehicle(
  profile: FitmentProfile,
  products: Awaited<ReturnType<typeof loadStockProducts>>,
  options: {
    purchasedProductIds: Set<string>;
    purchasedSkus: Array<{ sku: string; purchasedAt?: Date | null }>;
    purchasedTypes: string[];
    includeOutOfStock: boolean;
    reduceScoreSameFamily: boolean;
    confidenceThreshold: number;
    cooldownDays: number | "never";
    limit?: number;
  },
): StockMatch[] {
  if (!profile.make) return [];
  const make = profile.make.toLowerCase();
  const matches: StockMatch[] = [];

  for (const product of products) {
    if (options.purchasedProductIds.has(product.id)) continue;
    const productMakes = new Set<string>();
    if (product.make) productMakes.add(product.make.toLowerCase());
    for (const fitment of product.fitments) {
      if (!fitment.isNegative) productMakes.add(fitment.vehicle.make.toLowerCase());
    }
    if (productMakes.size && !productMakes.has(make)) continue;

    const negative = product.overrides.some((o) => !o.isCompatible) || product.fitments.some((f) => f.isNegative);
    const positiveOverride = product.overrides.some(
      (o) =>
        o.isCompatible &&
        (!o.make || o.make.toLowerCase() === make) &&
        (!o.series.length || o.series.some((s) => profile.series.includes(s))),
    );
    const explicitFitment = product.fitments.some(
      (f) =>
        !f.isNegative &&
        f.vehicle.make.toLowerCase() === make &&
        (profile.series.length === 0 || f.vehicle.series.some((code) => profile.series.includes(code))),
    );

    const scored = scoreRecommendation({
      customer: profile,
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
      purchasedSkus: options.purchasedSkus,
      purchasedProductTypes: options.purchasedTypes,
      cooldownDays: options.cooldownDays,
      includeOutOfStock: options.includeOutOfStock,
      reduceScoreSameFamily: options.reduceScoreSameFamily,
      confidenceThreshold: options.confidenceThreshold,
    });

    if (!scored.eligible) continue;
    matches.push({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      url: product.url,
      imageUrl: product.imageUrl,
      price: product.price != null ? Number(product.price) : null,
      score: scored.score,
      matchLevel: scored.matchLevel,
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, options.limit ?? 3);
}
