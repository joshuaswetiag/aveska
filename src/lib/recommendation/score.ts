import type { FitmentProfile, RecommendationScore, ScoreReason } from "@/types";
import { clamp } from "@/lib/utils";

export type MatchInput = {
  customer: FitmentProfile;
  product: FitmentProfile & {
    sku?: string | null;
    category?: string | null;
    fitment?: string | null;
    tags?: string[];
    discontinued?: boolean;
    stockStatus?: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN" | "DISCONTINUED";
    explicitCompatibility?: boolean;
    negativeMatch?: boolean;
  };
  purchasedSkus?: Array<{ sku: string; purchasedAt?: Date | null }>;
  purchasedProductTypes?: string[];
  now?: Date;
  cooldownDays?: number | "never";
  includeOutOfStock?: boolean;
  reduceScoreSameFamily?: boolean;
  confidenceThreshold?: number;
};

function seriesOverlap(a: string[], b: string[]): string[] {
  const right = new Set(b.map((s) => s.toUpperCase()));
  return a.map((s) => s.toUpperCase()).filter((s) => right.has(s));
}

function sameText(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function yearsOverlap(
  aFrom?: number | null,
  aTo?: number | null,
  bFrom?: number | null,
  bTo?: number | null,
): boolean {
  if (!aFrom && !aTo && !bFrom && !bTo) return false;
  if (!aFrom && !aTo) return false;
  if (!bFrom && !bTo) return false;
  const leftFrom = aFrom ?? aTo ?? 0;
  const leftTo = aTo ?? aFrom ?? 9999;
  const rightFrom = bFrom ?? bTo ?? 0;
  const rightTo = bTo ?? bFrom ?? 9999;
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function purchasedRecently(
  sku: string | null | undefined,
  purchasedSkus: MatchInput["purchasedSkus"],
  cooldownDays: number | "never",
  now: Date,
): boolean {
  if (!sku || !purchasedSkus?.length) return false;
  const needle = sku.trim().toLowerCase();
  const match = purchasedSkus.find((p) => p.sku.trim().toLowerCase() === needle);
  if (!match) return false;
  if (cooldownDays === "never") return true;
  if (!match.purchasedAt) return true;
  const elapsed = (now.getTime() - match.purchasedAt.getTime()) / 86400000;
  return elapsed <= cooldownDays;
}

export function scoreRecommendation(input: MatchInput): RecommendationScore {
  const reasons: ScoreReason[] = [];
  const now = input.now ?? new Date();
  const cooldown = input.cooldownDays ?? 90;
  const threshold = input.confidenceThreshold ?? 0.85;
  const customer = input.customer;
  const product = input.product;

  if (product.negativeMatch) {
    return {
      score: 0,
      scoreRaw: 0,
      confidence: 0,
      matchLevel: "INSUFFICIENT_DATA",
      reasons: [{ code: "negative", label: "Admin marked as incompatible", points: -100 }],
      eligible: false,
      exclusionReason: "Contradictory fitment override",
    };
  }

  if (product.discontinued || product.stockStatus === "DISCONTINUED") {
    return ineligible("Discontinued product", "discontinued");
  }

  if (!input.includeOutOfStock && product.stockStatus === "OUT_OF_STOCK") {
    return ineligible("Out of stock", "out_of_stock");
  }

  if (purchasedRecently(product.sku, input.purchasedSkus, cooldown, now)) {
    return ineligible("Purchased within cooldown period", "purchased_recently");
  }

  const makeMatch = sameText(customer.make, product.make);
  const familyMatch =
    sameText(customer.vehicleFamily, product.vehicleFamily) ||
    sameText(customer.model, product.model) ||
    sameText(customer.vehicleFamily, product.model) ||
    sameText(customer.model, product.vehicleFamily);
  const overlap = seriesOverlap(customer.series ?? [], product.series ?? []);
  const bodyMatch = sameText(customer.bodyType, product.bodyType);
  const yearMatch = yearsOverlap(
    customer.yearFrom,
    customer.yearTo,
    product.yearFrom,
    product.yearTo,
  );

  const productHasVehicleSignal =
    Boolean(product.make) ||
    Boolean(product.vehicleFamily) ||
    Boolean(product.model) ||
    (product.series?.length ?? 0) > 0 ||
    Boolean(product.fitment) ||
    Boolean(product.application) ||
    Boolean(product.explicitCompatibility);

  if (!productHasVehicleSignal) {
    return {
      score: 0,
      scoreRaw: -80,
      confidence: 0.2,
      matchLevel: "INSUFFICIENT_DATA",
      reasons: [{ code: "insufficient", label: "Insufficient fitment data", points: -80 }],
      eligible: false,
      exclusionReason: "Insufficient fitment data",
    };
  }

  if (customer.make && product.make && !makeMatch) {
    return {
      score: 0,
      scoreRaw: -100,
      confidence: 0.99,
      matchLevel: "INSUFFICIENT_DATA",
      reasons: [{ code: "incompatible_make", label: "Incompatible vehicle make", points: -100 }],
      eligible: false,
      exclusionReason: "Incompatible vehicles",
    };
  }

  let raw = 0;
  if (makeMatch) {
    raw += 40;
    reasons.push({ code: "make", label: `Exact ${customer.make} match`, points: 40 });
  }

  if (overlap.length > 0 && (customer.series?.length ?? 0) > 0) {
    const exactSeries =
      overlap.length === customer.series.length && overlap.length === product.series.length;
    if (exactSeries) {
      raw += 40;
      reasons.push({
        code: "series_exact",
        label: `Exact ${overlap.join("/")} series match`,
        points: 40,
      });
    } else {
      raw += 30;
      reasons.push({
        code: "series",
        label: `Series match (${overlap.join("/")})`,
        points: 30,
      });
    }
  }

  if (familyMatch) {
    raw += 20;
    reasons.push({
      code: "family",
      label: `Same vehicle family (${customer.vehicleFamily ?? customer.model})`,
      points: 20,
    });
  }

  if (bodyMatch) {
    raw += 10;
    reasons.push({ code: "body", label: `${customer.bodyType} application`, points: 10 });
  }

  if (yearMatch) {
    raw += 10;
    reasons.push({ code: "year", label: "Year range overlap", points: 10 });
  }

  if (product.fitment && customer.series.some((s) => product.fitment!.toUpperCase().includes(s.toUpperCase()))) {
    raw += 25;
    reasons.push({ code: "fitment", label: "Explicit fitment match", points: 25 });
  }

  if (product.explicitCompatibility) {
    raw += 30;
    reasons.push({ code: "explicit", label: "Explicit compatibility tag", points: 30 });
  }

  if (customer.application && product.category) {
    raw += 5;
    reasons.push({ code: "category", label: "Same category (secondary signal only)", points: 5 });
  }

  if (
    input.reduceScoreSameFamily &&
    input.purchasedProductTypes?.length &&
    product.category &&
    input.purchasedProductTypes.some((t) => t.toLowerCase() === product.category!.toLowerCase())
  ) {
    raw -= 8;
    reasons.push({ code: "same_family_purchased", label: "Already purchased similar product family", points: -8 });
  }

  const hasCoreVehicleMatch = makeMatch && (overlap.length > 0 || familyMatch || product.explicitCompatibility);
  if (!hasCoreVehicleMatch) {
    return {
      score: 0,
      scoreRaw: raw,
      confidence: 0.35,
      matchLevel: "INSUFFICIENT_DATA",
      reasons: [
        ...reasons,
        { code: "no_vehicle_compat", label: "Vehicle compatibility could not be established", points: -80 },
      ],
      eligible: false,
      exclusionReason: "Insufficient fitment data",
    };
  }

  let matchLevel: RecommendationScore["matchLevel"] = "RELATED_APPLICATION";
  if (makeMatch && overlap.length > 0 && (bodyMatch || familyMatch || product.explicitCompatibility)) {
    matchLevel = "EXACT";
  } else if (overlap.length > 0) {
    matchLevel = "SAME_SERIES";
  } else if (familyMatch) {
    matchLevel = "SAME_FAMILY";
  }

  const confidence =
    matchLevel === "EXACT" ? 0.96 : matchLevel === "SAME_SERIES" ? 0.9 : matchLevel === "SAME_FAMILY" ? 0.82 : 0.7;

  const normalized = clamp(Math.round((raw / 155) * 100), 0, 100);
  const eligible = confidence >= threshold && normalized >= 40;

  reasons.push({ code: "not_purchased", label: "Customer has not purchased this product", points: 0 });

  return {
    score: normalized,
    scoreRaw: raw,
    confidence: Number(confidence.toFixed(2)),
    matchLevel,
    reasons,
    eligible,
    exclusionReason: eligible ? undefined : confidence < threshold ? "Needs review — below confidence threshold" : undefined,
  };
}

function ineligible(label: string, code: string): RecommendationScore {
  return {
    score: 0,
    scoreRaw: -100,
    confidence: 1,
    matchLevel: "INSUFFICIENT_DATA",
    reasons: [{ code, label, points: -100 }],
    eligible: false,
    exclusionReason: label,
  };
}
