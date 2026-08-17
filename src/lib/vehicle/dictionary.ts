import type { LearnedVehicleKnowledge } from "@/types";

export type VehicleFamilyDef = {
  make: string;
  family: string;
  aliases: string[];
  series: string[];
};

/**
 * Bootstrap knowledge for Australian automotive terminology.
 * This is a starting dictionary only — catalogue imports and the admin
 * alias manager extend it at runtime. It is never treated as the only
 * supported vehicle set.
 */
export const BODY_TYPES = [
  "sedan",
  "coupe",
  "coupé",
  "hardtop",
  "wagon",
  "station wagon",
  "ute",
  "utility",
  "van",
  "panel van",
  "hatch",
  "hatchback",
  "convertible",
  "cabriolet",
  "roadster",
  "pickup",
  "pick-up",
  "dual cab",
  "extra cab",
  "crew cab",
  "troopcarrier",
  "troopy",
  "cab chassis",
  "cab-chassis",
] as const;

export const PRODUCT_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "Seat Belts", pattern: /seat\s*belts?/i },
  { type: "Rust Repair Panel", pattern: /rust\s*repair|repair\s*panel/i },
  { type: "Floor Panel", pattern: /floor\s*(panel|pan|repair)/i },
  { type: "Quarter Panel", pattern: /quarter\s*(panel|repair)/i },
  { type: "Guard", pattern: /\b(guard|fender)\b/i },
  { type: "Door Skin", pattern: /door\s*skin/i },
  { type: "Sill Panel", pattern: /\bsills?\b/i },
  { type: "Body Panel", pattern: /body\s*panel/i },
  { type: "Restoration Part", pattern: /restoration/i },
  { type: "Starter Motor", pattern: /starter\s*motor|\bstarter\b/i },
  { type: "Alternator", pattern: /alternator/i },
  { type: "Radiator", pattern: /radiator/i },
  { type: "Bumper", pattern: /bumper/i },
  { type: "Grille", pattern: /grille|grill/i },
  { type: "Lights", pattern: /\b(headlight|tail\s*light|indicator)/i },
  { type: "Mirrors", pattern: /mirror/i },
  { type: "Carpet", pattern: /carpet/i },
  { type: "Weather Seal", pattern: /weather\s*strip|seal/i },
];

export const MAKE_ALIASES: Record<string, string[]> = {
  Ford: ["ford"],
  Holden: ["holden", "gmh"],
  Toyota: ["toyota"],
  Chrysler: ["chrysler", "valiant"],
  Nissan: ["nissan", "datsun"],
  Mazda: ["mazda"],
  Mitsubishi: ["mitsubishi"],
  Honda: ["honda"],
  Subaru: ["subaru"],
  Volkswagen: ["volkswagen", "vw"],
  "Land Rover": ["land rover", "landrover"],
  Jeep: ["jeep"],
  Chevrolet: ["chevrolet", "chevy"],
  Dodge: ["dodge"],
  Hyundai: ["hyundai"],
  Kia: ["kia"],
  Isuzu: ["isuzu"],
  Suzuki: ["suzuki"],
  Datsun: ["datsun"],
};

export const VEHICLE_FAMILIES: VehicleFamilyDef[] = [
  {
    make: "Ford",
    family: "Falcon",
    aliases: ["falcon", "falcon xa", "falcon xb", "falcon xc"],
    series: ["XR", "XT", "XW", "XY", "XA", "XB", "XC", "XD", "XE", "XF", "EA", "EB", "ED", "EF", "EL", "AU", "BA", "BF", "FG", "FGX"],
  },
  {
    make: "Ford",
    family: "Cortina",
    aliases: ["cortina"],
    series: ["MK1", "MK2", "MK3", "MK4", "MK5", "TE", "TF"],
  },
  {
    make: "Ford",
    family: "Escort",
    aliases: ["escort"],
    series: ["MK1", "MK2"],
  },
  {
    make: "Ford",
    family: "Capri",
    aliases: ["capri"],
    series: ["MK1", "MK2", "MK3"],
  },
  {
    make: "Ford",
    family: "Mustang",
    aliases: ["mustang"],
    series: [],
  },
  {
    make: "Holden",
    family: "Kingswood",
    aliases: ["kingswood", "premier", "belmont", "statesman"],
    series: ["FX", "FJ", "FE", "FC", "FB", "EK", "EJ", "EH", "HD", "HR", "HK", "HT", "HG", "HQ", "HJ", "HX", "HZ", "WB"],
  },
  {
    make: "Holden",
    family: "Torana",
    aliases: ["torana"],
    series: ["HB", "LC", "LJ", "TA", "LH", "LX", "UC"],
  },
  {
    make: "Holden",
    family: "Commodore",
    aliases: ["commodore"],
    series: ["VB", "VC", "VH", "VK", "VL", "VN", "VP", "VR", "VS", "VT", "VX", "VY", "VZ", "VE", "VF"],
  },
  {
    make: "Chrysler",
    family: "Valiant",
    aliases: ["valiant", "charger"],
    series: ["R", "S", "AP5", "AP6", "VC", "VE", "VF", "VG", "VH", "VJ", "VK", "CL", "CM"],
  },
  {
    make: "Toyota",
    family: "LandCruiser",
    aliases: ["landcruiser", "land cruiser", "land-cruiser", "cruiser"],
    series: ["40", "60", "70", "75", "76", "78", "79", "80", "100", "105", "200", "300"],
  },
  {
    make: "Toyota",
    family: "Hilux",
    aliases: ["hilux", "hi-lux", "hi lux"],
    series: ["RN", "LN", "YN", "N80", "N90", "N100", "N120", "N140"],
  },
  {
    make: "Toyota",
    family: "Corolla",
    aliases: ["corolla"],
    series: ["KE", "TE", "AE"],
  },
  {
    make: "Nissan",
    family: "Patrol",
    aliases: ["patrol"],
    series: ["GQ", "GU", "Y60", "Y61", "Y62"],
  },
  {
    make: "Nissan",
    family: "Navara",
    aliases: ["navara"],
    series: ["D21", "D22", "D40", "D23"],
  },
  {
    make: "Volkswagen",
    family: "Transporter",
    aliases: ["transporter", "kombi", "caravelle"],
    series: ["T3", "T4", "T5", "T6", "T61"],
  },
  {
    make: "Volkswagen",
    family: "Golf",
    aliases: ["golf"],
    series: ["MK1", "MK2", "MK3", "MK4", "MK5", "MK6", "MK7"],
  },
  {
    make: "Volkswagen",
    family: "Amarok",
    aliases: ["amarok"],
    series: [],
  },
];

export const SERIES_TO_FAMILY: Record<string, { make: string; family: string }> = {};
for (const family of VEHICLE_FAMILIES) {
  for (const code of family.series) {
    const key = code.toUpperCase();
    if (!SERIES_TO_FAMILY[key]) {
      SERIES_TO_FAMILY[key] = { make: family.make, family: family.family };
    }
  }
}

export const PRODUCT_NOISE = /\b(starter|alternator|motor|belt|panel|repair|sensor|switch|pump|filter|hose|gasket|bearing|bush|kit|pair)\b/i;

export function looksLikeProductTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  const text = value.trim();
  if (/\bfor\b/i.test(text) || /\bto\s+suit\b/i.test(text)) return true;
  return PRODUCT_TYPE_PATTERNS.some((item) => item.pattern.test(text));
}

export const STOP_TOKENS = new Set([
  "to",
  "suit",
  "suits",
  "for",
  "fits",
  "fit",
  "the",
  "and",
  "or",
  "a",
  "an",
  "with",
  "pair",
  "set",
  "lh",
  "rh",
  "left",
  "right",
  "front",
  "rear",
  "upper",
  "lower",
  "inner",
  "outer",
]);

export function mergeLearnedKnowledge(learned?: LearnedVehicleKnowledge | null) {
  const makes = { ...MAKE_ALIASES };
  if (learned?.makes) {
    for (const make of learned.makes) {
      const key = make.trim();
      if (!key) continue;
      const existing = Object.keys(makes).find((m) => m.toLowerCase() === key.toLowerCase());
      if (existing) {
        if (!makes[existing].includes(key.toLowerCase())) {
          makes[existing].push(key.toLowerCase());
        }
      } else {
        makes[key] = [key.toLowerCase()];
      }
    }
  }

  const families = [...VEHICLE_FAMILIES];
  if (learned?.families) {
    for (const item of learned.families) {
      const existing = families.find(
        (f) =>
          f.make.toLowerCase() === item.make.toLowerCase() &&
          f.family.toLowerCase() === item.family.toLowerCase(),
      );
      if (existing) {
        existing.aliases = [...new Set([...existing.aliases, ...item.aliases.map((a) => a.toLowerCase())])];
      } else {
        families.push({
          make: item.make,
          family: item.family,
          aliases: item.aliases.map((a) => a.toLowerCase()),
          series: [],
        });
      }
    }
  }

  const seriesMap = { ...SERIES_TO_FAMILY };
  if (learned?.series) {
    for (const item of learned.series) {
      const code = item.code.toUpperCase();
      if (!seriesMap[code] && item.make && item.family) {
        seriesMap[code] = { make: item.make, family: item.family };
      }
    }
  }

  return { makes, families, seriesMap, aliases: learned?.aliases ?? [] };
}
