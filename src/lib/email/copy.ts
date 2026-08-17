type CopyInput = {
  firstName: string;
  vehicle: string;
  make: string;
  series: string;
  purchasedProduct: string;
  campaignType: string;
};

function tidy(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

export function vehicleDisplayName(input: Pick<CopyInput, "vehicle" | "make" | "series">) {
  const vehicle = tidy(input.vehicle);
  if (vehicle) return vehicle;
  return [tidy(input.make), tidy(input.series)].filter(Boolean).join(" ") || "your vehicle";
}

export function seriesDisplayName(input: Pick<CopyInput, "vehicle" | "make" | "series">) {
  return tidy(input.series) || vehicleDisplayName(input);
}

function shortPurchase(name: string) {
  const cleaned = tidy(name).replace(/\s+to suit\b.*/i, "").replace(/\s+suits\b.*/i, "");
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 39).trim()}…`;
}

export function professionalSubject(input: CopyInput) {
  const vehicle = vehicleDisplayName(input);
  const series = seriesDisplayName(input);
  const purchased = shortPurchase(input.purchasedProduct);
  const type = input.campaignType.toUpperCase();

  if (type === "RELATED_PRODUCTS" && purchased) {
    return `A few ${series} parts to go with your ${purchased}`;
  }
  if (type === "RE_ENGAGEMENT") {
    return `Still working on your ${vehicle}?`;
  }
  if (type === "VEHICLE_RESTORATION") {
    return `Selected parts for your ${vehicle} restoration`;
  }
  if (type === "NEW_PRODUCT") {
    return `New ${series} parts now at Aveska`;
  }
  if (type === "BACK_IN_STOCK") {
    return `${series} parts are available again`;
  }
  if (type === "NEWSLETTER") {
    return `Aveska update for ${vehicle} owners`;
  }
  return `Selected parts for your ${vehicle}`;
}

export function professionalEmailCopy(input: CopyInput): {
  subject: string;
  preheader: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
} {
  const name = tidy(input.firstName) || "there";
  const vehicle = vehicleDisplayName(input);
  const series = seriesDisplayName(input);
  const purchased = shortPurchase(input.purchasedProduct);
  const thanks = purchased
    ? `Thank you for choosing Aveska for your ${vehicle}. Your recent ${purchased} is a solid step on the build.`
    : `Thank you for choosing Aveska for your ${vehicle}.`;

  return {
    subject: professionalSubject(input),
    preheader: `Hand-selected ${series} parts from Aveska, chosen to suit your vehicle.`,
    greeting: `Hi ${name},`,
    body: `${thanks}\n\nWe've selected a short list of ${series} parts that restorers typically look for as the project moves forward. Each item below is chosen to suit your ${vehicle}.\n\nRecommended for your ${vehicle}:`,
    ctaLabel: `View ${series} parts`,
    ctaUrl: "{{shop_url}}",
    footer: `Looking for a specific part? Contact our team and we will help you find it.\n\nKind regards,\nThe Aveska Team`,
  };
}
