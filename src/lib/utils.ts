import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseInteger(value: unknown): number | null {
  const num = parseNumber(value);
  if (num === null) return null;
  return Math.round(num);
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    // Excel serial date
    if (value > 20000 && value < 80000) {
      const utc = new Date(Math.round((value - 25569) * 86400 * 1000));
      return Number.isNaN(utc.getTime()) ? null : utc;
    }
    const fromMs = new Date(value);
    return Number.isNaN(fromMs.getTime()) ? null : fromMs;
  }
  const text = String(value).trim();
  if (!text) return null;
  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso);
  const au = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (au) {
    const day = Number(au[1]);
    const month = Number(au[2]) - 1;
    let year = Number(au[3]);
    if (year < 100) year += year > 50 ? 1900 : 2000;
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export const STORE_TIMEZONE = "Australia/Sydney";

export function storeIsoDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Neto sends naive datetimes in UTC. */
export function parseNetoDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(iso);
  const date = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addUtcDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function zonedLocalToUtc(isoDate: string, time: string, timeZone: string): Date {
  const naive = new Date(`${isoDate}T${time}Z`);
  const first = new Date(naive.getTime() - timeZoneOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - timeZoneOffsetMs(first, timeZone));
}

/** Inclusive start of the store calendar day, exclusive start of the next day. */
export function zonedDayRange(isoDate: string, timeZone = STORE_TIMEZONE): { start: Date; end: Date } {
  return {
    start: zonedLocalToUtc(isoDate, "00:00:00.000", timeZone),
    end: zonedLocalToUtc(addUtcDays(isoDate, 1), "00:00:00.000", timeZone),
  };
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(Number(num));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: STORE_TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: STORE_TIMEZONE,
  }).format(date);
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function compact<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item !== null && item !== undefined);
}

export function firstNameFrom(name: string | null | undefined): string {
  if (!name) return "";
  const cleaned = normalizeWhitespace(name);
  if (!cleaned) return "";
  return cleaned.split(" ")[0];
}

export function withUtm(
  url: string,
  params: { source: string; medium: string; campaign: string; content?: string },
): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", params.source);
    parsed.searchParams.set("utm_medium", params.medium);
    parsed.searchParams.set("utm_campaign", params.campaign);
    if (params.content) parsed.searchParams.set("utm_content", params.content);
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    const content = params.content ? `&utm_content=${encodeURIComponent(params.content)}` : "";
    return `${url}${join}utm_source=${encodeURIComponent(params.source)}&utm_medium=${encodeURIComponent(params.medium)}&utm_campaign=${encodeURIComponent(params.campaign)}${content}`;
  }
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

export function similarity(a: string, b: string): number {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}
