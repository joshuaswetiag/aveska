import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const DEV_SECRET = "dev-only-change-this-to-a-long-random-string";

function materials() {
  const mail = process.env.MAIL_SECRET_KEY?.trim();
  const auth = process.env.AUTH_SECRET?.trim();
  const keys = [mail, auth].filter((value): value is string => Boolean(value) && value !== DEV_SECRET);
  const production = process.env.NODE_ENV === "production" || process.env.AVESKA_RUNTIME === "worker";
  if (!keys.length) {
    if (production) throw new Error("Set MAIL_SECRET_KEY before storing mail secrets.");
    return [DEV_SECRET];
  }
  return keys;
}

function keyFrom(material: string) {
  return createHash("sha256").update(material).digest();
}

/** Encrypt a mail secret for storage. Plaintext and already-sealed values are accepted. */
export function sealSecret(value: string | null | undefined): string | null {
  const plain = value?.trim();
  if (!plain) return null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(materials()[0]), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

/** Decrypt a stored mail secret. Values saved before encryption are returned unchanged. */
export function openSecret(value: string | null | undefined): string | null {
  const stored = value?.trim();
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(".");
    if (!iv || !tag || !data) return null;
    for (const material of materials()) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", keyFrom(material), Buffer.from(iv, "base64url"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
        if (plain) return plain;
      } catch {
        // Try the next key. AUTH_SECRET and MAIL_SECRET_KEY can both open older rows.
      }
    }
    console.error("Could not decrypt a stored mail secret. Set MAIL_SECRET_KEY to the key that sealed it, then save the password again.");
    return null;
  } catch {
    return null;
  }
}
