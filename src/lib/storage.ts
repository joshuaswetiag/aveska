import type { R2Bucket } from "@/types/cloudflare-bindings";

const globalStore = globalThis as unknown as { aveskaUploads?: R2Bucket };

export function bindWorkerUploads(bucket: R2Bucket | undefined) {
  globalStore.aveskaUploads = bucket;
}

function keyFromPath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^uploads\//, "").replace(/^\.\/uploads\//, "");
}

export async function saveUpload(relativeName: string, data: Buffer | Uint8Array) {
  const key = keyFromPath(relativeName);
  if (globalStore.aveskaUploads) {
    await globalStore.aveskaUploads.put(key, data);
    return `uploads/${key}`;
  }
  if (process.env.AVESKA_RUNTIME === "worker") {
    throw new Error("File uploads need an R2 bucket. Enable R2 and bind UPLOADS in wrangler.toml.");
  }
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, key);
  await writeFile(filePath, data);
  return filePath;
}

export async function deleteUpload(filePath: string) {
  const key = keyFromPath(filePath);
  if (globalStore.aveskaUploads) {
    await globalStore.aveskaUploads.delete(key);
    return;
  }
  if (process.env.AVESKA_RUNTIME === "worker") return;
  const { unlink } = await import("fs/promises");
  await unlink(filePath).catch(() => undefined);
}

export async function readUpload(filePath: string) {
  if (globalStore.aveskaUploads) {
    const object = await globalStore.aveskaUploads.get(keyFromPath(filePath));
    if (!object) throw new Error(`Upload not found: ${filePath}`);
    return Buffer.from(await object.arrayBuffer());
  }
  const { readFile } = await import("fs/promises");
  return readFile(filePath);
}
