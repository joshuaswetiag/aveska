import { createHmac, timingSafeEqual } from "node:crypto";
import { readEnv } from "@/lib/read-env";

const DEV_SECRET = "dev-only-change-this-to-a-long-random-string";

function secret() {
  const value = readEnv("AUTH_" + "SECRET")?.trim();
  return value && value !== DEV_SECRET ? value : DEV_SECRET;
}

export function unsubscribeToken(recipientId: string) {
  return createHmac("sha256", secret()).update(`unsub:${recipientId}`).digest("base64url");
}

export function unsubscribeUrl(origin: string, recipientId: string) {
  const token = unsubscribeToken(recipientId);
  return `${origin.replace(/\/$/, "")}/t/${encodeURIComponent(recipientId)}/unsubscribe?t=${encodeURIComponent(token)}`;
}

export function validUnsubscribeToken(recipientId: string, token: string | null) {
  if (!token || recipientId === "test") return false;
  const expected = Buffer.from(unsubscribeToken(recipientId));
  const given = Buffer.from(token);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

/** Emails sent before signed links shipped have no ?t= parameter. */
export const LEGACY_UNSIGNED_UNTIL = Date.parse("2026-11-12T00:00:00.000Z");

export function unsignedUnsubscribeStillValid(sentAt: Date | string | null | undefined) {
  if (!sentAt) return false;
  const time = sentAt instanceof Date ? sentAt.getTime() : Date.parse(sentAt);
  return Number.isFinite(time) && time < LEGACY_UNSIGNED_UNTIL;
}
