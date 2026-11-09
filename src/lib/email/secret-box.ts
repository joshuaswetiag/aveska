import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key() {
  const secret = process.env.AUTH_SECRET?.trim();
  const material =
    secret && secret !== "dev-only-change-this-to-a-long-random-string"
      ? secret
      : "dev-only-change-this-to-a-long-random-string";
  return createHash("sha256").update(material).digest();
}

/** Encrypt a mail secret for storage. Plaintext and already-sealed values are accepted. */
export function sealSecret(value: string | null | undefined): string | null {
  const plain = value?.trim();
  if (!plain) return null;
  if (plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
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
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    return plain || null;
  } catch {
    return null;
  }
}
