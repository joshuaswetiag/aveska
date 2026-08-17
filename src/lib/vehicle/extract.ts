import type { LearnedVehicleKnowledge, VehicleExtraction } from "@/types";
import { normalizeWhitespace, unique } from "@/lib/utils";
import {
  BODY_TYPES,
  PRODUCT_TYPE_PATTERNS,
  STOP_TOKENS,
  looksLikeProductTitle,
  mergeLearnedKnowledge,
} from "@/lib/vehicle/dictionary";

const SUIT_SPLIT = /\b(?:to\s+suit|suits?|fits?|fitment(?:\s+for)?|application(?:\s+for)?)\b/i;
const YEAR_RANGE = /\b((?:19|20)\d{2})\s*(?:-|–|to|\/)\s*((?:19|20)?\d{2})\b/i;
const ENGINE_PATTERN = /\b([A-Z]{2,5})\s+(\d(?:\.\d)?L?)\s+(Diesel|Petrol|TDI|TSI|Turbo)\b/i;
const TRANSMISSION_PATTERN = /\b(Manual|Automatic|Auto)\b/i;
const YEAR_SINGLE = /\b((?:19|20)\d{2})\b/;
const SERIES_TOKEN = /^[A-Z]{1,3}\d{0,2}[A-Z]?$/;
const LANDCRUISER_SERIES = /^(\d{2,3})\s*series$/i;

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/gi, " ");
}

function tokenize(text: string): string[] {
  return normalizeWhitespace(text)
    .replace(/[/,+|&]/g, " ")
    .replace(/-/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

function detectMake(
  text: string,
  makes: Record<string, string[]>,
): { make: string | null; evidence: string[] } {
  const lower = text.toLowerCase();
  let best: { make: string; alias: string; index: number } | null = null;
  for (const [make, aliases] of Object.entries(makes)) {
    for (const alias of aliases) {
      const index = lower.indexOf(alias);
      if (index === -1) continue;
      const before = index === 0 || !/[a-z0-9]/i.test(lower[index - 1] ?? "");
      const after =
        index + alias.length >= lower.length ||
        !/[a-z0-9]/i.test(lower[index + alias.length] ?? "");
      if (!before || !after) continue;
      if (!best || index < best.index || alias.length > best.alias.length) {
        best = { make, alias, index };
      }
    }
  }
  return best
    ? { make: best.make, evidence: [`make:${best.make}`] }
    : { make: null, evidence: [] };
}

function detectBodyType(text: string): string | null {
  const lower = text.toLowerCase();
  const sorted = [...BODY_TYPES].sort((a, b) => b.length - a.length);
  for (const body of sorted) {
    if (lower.includes(body)) {
      if (body === "ute" || body === "utility") return "Ute";
      if (body === "hatch" || body === "hatchback") return "Hatch";
      if (body === "wagon" || body === "station wagon") return "Wagon";
      if (body === "coupe" || body === "coupé") return "Coupe";
      if (body === "troopcarrier" || body === "troopy") return "Troopcarrier";
      return body
        .split(" ")
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
  return null;
}

function detectProductType(text: string): string | null {
  for (const item of PRODUCT_TYPE_PATTERNS) {
    if (item.pattern.test(text)) return item.type;
  }
  const beforeSuit = text.split(SUIT_SPLIT)[0]?.trim();
  if (beforeSuit && beforeSuit.length > 3 && beforeSuit.length < 80) {
    return normalizeWhitespace(beforeSuit.replace(/[-–]$/, ""));
  }
  return null;
}

function detectYears(text: string): { yearFrom: number | null; yearTo: number | null } {
  const range = text.match(YEAR_RANGE);
  if (range) {
    const from = Number(range[1]);
    let to = Number(range[2]);
    if (to < 100) {
      to += Math.floor(from / 100) * 100;
      if (to < from) to += 100;
    }
    return { yearFrom: from, yearTo: to };
  }
  const single = text.match(YEAR_SINGLE);
  if (single) {
    const year = Number(single[1]);
    return { yearFrom: year, yearTo: year };
  }
  return { yearFrom: null, yearTo: null };
}

function collectSeries(
  tokens: string[],
  make: string | null,
  seriesMap: Record<string, { make: string; family: string }>,
  learnedSeries: string[],
): { series: string[]; family: string | null } {
  const found: string[] = [];
  let family: string | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const raw = tokens[i];
    const upper = raw.toUpperCase();
    const next = tokens[i + 1];

    const cruiser = `${raw} ${next ?? ""}`.match(LANDCRUISER_SERIES);
    if (cruiser) {
      found.push(cruiser[1]);
      family = family ?? "LandCruiser";
      continue;
    }

    if (STOP_TOKENS.has(raw.toLowerCase())) continue;
    if (upper.length < 1 || upper.length > 5) continue;
    if (!SERIES_TOKEN.test(upper) && !/^\d{2,3}$/.test(upper)) continue;

    const known = seriesMap[upper];
    const learned = learnedSeries.includes(upper);
    if (known) {
      if (make && known.make.toLowerCase() !== make.toLowerCase()) {
        // Series code belongs to a different make — skip unless make unknown
        continue;
      }
      found.push(upper);
      family = family ?? known.family;
    } else if (learned && !/^\d{2,3}$/.test(upper)) {
      found.push(upper);
    } else if (make && /^[A-Z]{2}$/.test(upper) && i > 0) {
      // Adjacent 2-letter codes after a detected make, e.g. XB XC
      const prev = tokens[i - 1]?.toUpperCase();
      if (found.includes(prev) || (prev && seriesMap[prev]?.make === make)) {
        found.push(upper);
      }
    }
  }

  return { series: unique(found), family };
}

function splitProductAndVehicle(
  text: string,
  makes: Record<string, string[]>,
): { productPart: string; vehiclePart: string } {
  const suit = text.split(SUIT_SPLIT);
  if (suit.length > 1) {
    return { productPart: suit[0], vehiclePart: suit.slice(1).join(" ") };
  }
  const match = text.match(/\bfor\b/i);
  if (match && match.index !== undefined) {
    const after = text.slice(match.index + match[0].length);
    if (detectMake(after, makes).make) {
      return { productPart: text.slice(0, match.index), vehiclePart: after };
    }
  }
  return { productPart: text, vehiclePart: text };
}

function detectEngine(text: string): { engine: string | null; engineCode: string | null } {
  const match = text.match(ENGINE_PATTERN);
  if (!match) return { engine: null, engineCode: null };
  return {
    engine: `${match[2]} ${match[3]}`,
    engineCode: match[1].toUpperCase(),
  };
}

function detectFamily(
  text: string,
  make: string | null,
  families: ReturnType<typeof mergeLearnedKnowledge>["families"],
): string | null {
  const lower = text.toLowerCase();
  const candidates = families.filter((f) => !make || f.make.toLowerCase() === make.toLowerCase());
  let best: { family: string; alias: string } | null = null;
  for (const family of candidates) {
    for (const alias of family.aliases) {
      if (!lower.includes(alias)) continue;
      if (!best || alias.length > best.alias.length) {
        best = { family: family.family, alias };
      }
    }
  }
  return best?.family ?? null;
}

export function extractVehicle(
  input: {
    name?: string | null;
    description?: string | null;
    sku?: string | null;
    category?: string | null;
    fitment?: string | null;
    application?: string | null;
    make?: string | null;
    model?: string | null;
    series?: string | string[] | null;
    bodyType?: string | null;
    vehicle?: string | null;
  },
  learned?: LearnedVehicleKnowledge | null,
): VehicleExtraction {
  const knowledge = mergeLearnedKnowledge(learned);
  const rawModel = input.model && !looksLikeProductTitle(input.model) ? normalizeWhitespace(input.model) : null;
  const name = stripHtml(input.name ?? "");
  const auxiliary = [input.fitment, input.application, input.vehicle, rawModel]
    .filter((value) => value && !looksLikeProductTitle(value))
    .map((value) => stripHtml(String(value)))
    .join(" ");
  const description = stripHtml(input.description ?? "");
  const primaryText = normalizeWhitespace([name, auxiliary].filter(Boolean).join(" "));
  const fallbackText = normalizeWhitespace([primaryText, description, input.category].filter(Boolean).join(" "));
  const primarySplit = splitProductAndVehicle(primaryText, knowledge.makes);
  const hasVehicleInName = Boolean(detectMake(primarySplit.vehiclePart, knowledge.makes).make);
  const text = hasVehicleInName ? primaryText : fallbackText;
  const { productPart, vehiclePart } = hasVehicleInName
    ? primarySplit
    : splitProductAndVehicle(text, knowledge.makes);
  const evidence: string[] = [];

  const aliasHit = knowledge.aliases
    .filter((a) => a.alias && vehiclePart.toLowerCase().includes(a.alias.toLowerCase()))
    .sort((a, b) => b.alias.length - a.alias.length)[0];

  let make = input.make && !looksLikeProductTitle(input.make) ? normalizeWhitespace(input.make) : null;
  if (make) evidence.push("source:make_field");
  else {
    const detected = detectMake(vehiclePart, knowledge.makes);
    make = detected.make ?? aliasHit?.make ?? null;
    evidence.push(...detected.evidence);
    if (!detected.make && aliasHit?.make) evidence.push("alias:make");
  }

  const bodyType = input.bodyType
    ? normalizeWhitespace(input.bodyType)
    : detectBodyType(vehiclePart);
  if (bodyType) evidence.push(`body:${bodyType}`);

  const years = detectYears(vehiclePart);
  const productType = detectProductType(productPart);
  const engine = detectEngine(vehiclePart);
  const variant = vehiclePart.match(TRANSMISSION_PATTERN)?.[1]
    ? vehiclePart.match(TRANSMISSION_PATTERN)![1].replace(/^auto$/i, "Automatic")
    : null;

  const explicitSeries = Array.isArray(input.series)
    ? input.series
    : input.series
      ? String(input.series).split(/[/,+\s]+/)
      : [];

  const tokens = tokenize(vehiclePart);
  const learnedSeriesCodes = [
    ...Object.keys(knowledge.seriesMap),
    ...(learned?.series.map((s) => s.code.toUpperCase()) ?? []),
  ];
  const collected = collectSeries(tokens, make, knowledge.seriesMap, learnedSeriesCodes);
  const series = unique(
    [...explicitSeries, ...collected.series, ...(aliasHit?.series ?? [])]
      .map((s) => s.toUpperCase().trim())
      .filter(Boolean)
      .filter((code) => {
        if (engine.engineCode && code === engine.engineCode) return false;
        const known = knowledge.seriesMap[code];
        if (known && make && known.make.toLowerCase() !== make.toLowerCase()) return false;
        return true;
      }),
  );
  if (series.length) evidence.push(`series:${series.join(",")}`);

  let vehicleFamily = detectFamily(vehiclePart, make, knowledge.families) ?? collected.family ?? aliasHit?.family ?? null;
  if (rawModel && !looksLikeProductTitle(rawModel) && rawModel.split(" ").length <= 3) {
    vehicleFamily = vehicleFamily ?? rawModel;
    evidence.push("source:model_field");
  }
  if (vehicleFamily && looksLikeProductTitle(vehicleFamily)) vehicleFamily = null;
  if (vehicleFamily) evidence.push(`family:${vehicleFamily}`);

  // Chrysler Valiant: "Valiant" may appear as make-like family without Chrysler
  if (!make && vehicleFamily === "Valiant") make = "Chrysler";
  if (!make && vehicleFamily === "Torana") make = "Holden";
  if (!make && series.length) {
    const hint = knowledge.seriesMap[series[0]];
    if (hint) {
      make = hint.make;
      vehicleFamily = vehicleFamily ?? hint.family;
      evidence.push("series_inferred_make");
    }
  }

  const aliases: string[] = [];
  if (make && series.length) {
    aliases.push(`${make} ${series.join("/")}`);
    aliases.push(series.join("/"));
    if (vehicleFamily) aliases.push(`${make} ${vehicleFamily} ${series.join("/")}`);
  }

  let confidence = 0;
  if (make) confidence += 0.35;
  if (series.length) confidence += 0.4;
  if (vehicleFamily) confidence += 0.15;
  if (bodyType) confidence += 0.08;
  if (input.fitment || input.application || input.make) confidence += 0.1;
  if (!make && !series.length && !vehicleFamily) confidence = productType ? 0.2 : 0.05;
  confidence = Math.min(0.99, Number(confidence.toFixed(2)));

  const yearLabel = formatYearRange(years.yearFrom, years.yearTo);
  const engineLabel = [engine.engineCode, engine.engine].filter(Boolean).join(" ");
  const application = [make, vehicleFamily, series.join("/"), variant, yearLabel, engineLabel, bodyType]
    .filter(Boolean)
    .join(" ")
    .trim() || null;

  return {
    make,
    model: vehicleFamily,
    vehicleFamily,
    series,
    generation: null,
    bodyType,
    yearFrom: years.yearFrom,
    yearTo: years.yearTo,
    engine: engine.engine,
    engineCode: engine.engineCode,
    variant,
    driveType: null,
    application,
    vehicleAliases: unique(aliases),
    productType,
    confidence,
    evidence,
  };
}

/** True when the extraction is a real vehicle application, not just a body type or product. */
export function isIdentifiedVehicle(extraction: {
  make?: string | null;
  vehicleFamily?: string | null;
  model?: string | null;
  series?: string[] | null;
  confidence?: number | null;
} | null | undefined): boolean {
  if (!extraction?.make?.trim()) return false;
  const series = (extraction.series ?? []).filter(Boolean);
  const family = extraction.vehicleFamily?.trim() || extraction.model?.trim();
  return series.length > 0 || Boolean(family);
}

export function formatYearRange(from?: number | null, to?: number | null): string {
  if (!from && !to) return "";
  if (from && to && from !== to) return `${from}-${String(to).slice(-2).padStart(2, "0")}`;
  return String(from ?? to);
}

export function canonicalVehicleName(extraction: {
  make?: string | null;
  vehicleFamily?: string | null;
  model?: string | null;
  series?: string[];
  bodyType?: string | null;
  variant?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  engine?: string | null;
  engineCode?: string | null;
}): string {
  const series = (extraction.series ?? []).filter(Boolean);
  const years = formatYearRange(extraction.yearFrom, extraction.yearTo);
  const engine = [extraction.engineCode, extraction.engine].filter(Boolean).join(" ");
  return [
    extraction.make,
    extraction.vehicleFamily ?? extraction.model,
    series.join("/"),
    extraction.variant,
    years,
    engine,
    extraction.bodyType,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function vehicleSearchText(extraction: {
  make?: string | null;
  vehicleFamily?: string | null;
  model?: string | null;
  series?: string[];
  bodyType?: string | null;
  aliases?: string[];
}): string {
  return unique(
    [
      extraction.make,
      extraction.vehicleFamily,
      extraction.model,
      ...(extraction.series ?? []),
      extraction.bodyType,
      ...(extraction.aliases ?? []),
      canonicalVehicleName(extraction),
    ]
      .filter(Boolean)
      .map((v) => String(v).toLowerCase()),
  ).join(" ");
}
