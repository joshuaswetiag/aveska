import { compareSync } from "bcryptjs";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/** Enough work for a paid Worker. Pure-JS bcrypt exceeded the free-plan CPU limit. */
const ITERATIONS = 100_000;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("base64url");
  return `pbkdf2:${ITERATIONS}:${salt}:${hash}`;
}

export function passwordMatches(password: string, stored: string) {
  if (stored.startsWith("sha256:")) {
    const digest = `sha256:${createHash("sha256").update(password).digest("hex")}`;
    return safeEqual(digest, stored);
  }
  if (stored.startsWith("$2")) return compareSync(password, stored);
  const [scheme, rounds, salt, expected] = stored.split(":");
  if (scheme !== "pbkdf2" || !salt || !expected) return false;
  const iterations = Number(rounds);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  const actual = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url");
  return safeEqual(actual, expected);
}
