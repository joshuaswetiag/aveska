/** Store money as integer cents so SQLite does not round decimal prices. */

export function toCents(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || /[a-z]/i.test(raw)) return null;
  const wrapped = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = (wrapped ? raw.slice(1, -1) : raw).replace(/[^0-9.-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round((wrapped ? -Math.abs(num) : num) * 100);
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
