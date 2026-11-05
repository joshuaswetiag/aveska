import type { Prisma } from "@prisma/client";

/** Normalize Prisma Json / unknown values into a string array (SQLite has no String[]). */
export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

export function toJsonArray(values: string[] | null | undefined): Prisma.InputJsonValue {
  return (values ?? []) as Prisma.InputJsonValue;
}

export function pushJsonArray(current: unknown, value: string): Prisma.InputJsonValue {
  const next = asStringArray(current);
  if (!next.includes(value)) next.push(value);
  return next as Prisma.InputJsonValue;
}
