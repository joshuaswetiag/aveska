import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "dev-only-change-this-to-a-long-random-string";

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
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
