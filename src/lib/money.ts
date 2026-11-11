/** Store money as integer cents so SQLite does not round decimal prices. */

export function toCents(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const num =
    typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

export function fromCents(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num / 100;
}

const MONEY_KEYS = new Set([
  "price",
  "orderTotal",
  "unitPrice",
  "lineTotal",
  "totalSpend",
  "averageOrderValue",
  "revenue",
  "orderRevenue",
]);

function isRecord(value: object) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Turn stored cents into dollars on objects that are about to be sent to the browser. */
export function presentMoney(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) presentMoney(item);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date || !isRecord(value)) return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (MONEY_KEYS.has(key) && child != null) {
      if (typeof child === "string" && /[^0-9.\-]/.test(child.trim())) continue;
      const numeric = typeof child === "object" ? Number(child) : child;
      record[key] = fromCents(numeric as number | string);
      continue;
    }
    presentMoney(child);
  }
}

/** Drop raw import payloads before a row is sent to the browser. */
export function stripOriginalData(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) stripOriginalData(item);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date || !isRecord(value)) return;
  const record = value as Record<string, unknown>;
  delete record.originalData;
  for (const child of Object.values(record)) stripOriginalData(child);
}

export function prepareClient<T>(value: T): T {
  stripOriginalData(value);
  presentMoney(value);
  return value;
}
