import { storeIsoDate } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { syncNetoCatalogue } from "@/lib/catalogue/neto";
import { syncNetoOrders } from "@/lib/catalogue/neto-orders";
import { extractCatalogueFitments, extractOrderVehicles } from "@/lib/vehicle/persist";
import { generateRecommendations } from "@/lib/recommendation/generate";

export const FULL_SYNC_FROM = "2016-01-01";

export function isFullSyncJob(payload: unknown) {
  return Boolean(payload && typeof payload === "object" && (payload as { kind?: string }).kind === "full");
}

async function scaled(
  start: number,
  span: number,
  onProgress: ((done: number, total: number, message?: string) => Promise<void>) | undefined,
  run: (progress: (done: number, total: number, message?: string) => Promise<void>) => Promise<unknown>,
) {
  return run(async (done, total, message) => {
    const pct = start + Math.round((done / Math.max(total, 1)) * span);
    await onProgress?.(Math.min(99, pct), 100, message);
  });
}

export async function syncFullAveskaStore(
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
) {
  const to = storeIsoDate();
  const from = FULL_SYNC_FROM;

  await onProgress?.(1, 100, "Syncing live Aveska products…");
  const catalogue = await scaled(1, 34, onProgress, (progress) => syncNetoCatalogue(progress));

  await onProgress?.(36, 100, "Syncing customers, orders, and revenue…");
  const orders = await scaled(36, 40, onProgress, (progress) => syncNetoOrders(progress, { from, to }));

  await onProgress?.(77, 100, "Matching vehicles from the catalogue…");
  await extractCatalogueFitments(async (done, total) => {
    await onProgress?.(77 + Math.round((done / Math.max(total, 1)) * 6), 100, "Matching vehicles from the catalogue…");
  });

  await onProgress?.(84, 100, "Matching vehicles from orders…");
  await extractOrderVehicles(async (done, total) => {
    await onProgress?.(84 + Math.round((done / Math.max(total, 1)) * 6), 100, "Matching vehicles from orders…");
  });

  await onProgress?.(91, 100, "Building customer recommendations…");
  const recommendations = await generateRecommendations({
    onProgress: async (done, total) => {
      await onProgress?.(
        91 + Math.round((done / Math.max(total, 1)) * 8),
        100,
        `Building recommendations ${done.toLocaleString()} / ${Math.max(total, 1).toLocaleString()}`,
      );
    },
  });

  await onProgress?.(100, 100, "Aveska store loaded");
  return { catalogue, orders, recommendations, from, to };
}

export async function listFullSyncJobs() {
  const jobs = await prisma.job.findMany({
    where: { type: "NETO_SYNC" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return jobs.filter((job) => isFullSyncJob(job.payload));
}

export async function ensureFullSyncQueued(createdById?: string, force = false) {
  if (!process.env.NETO_API_KEY?.trim()) return null;
  const fullJobs = await listFullSyncJobs();
  const active = fullJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING");
  if (active) return active;
  const [products, orders] = await Promise.all([prisma.product.count(), prisma.order.count()]);
  const completed = fullJobs.find((job) => job.status === "COMPLETED");
  if (!force && completed && products > 0 && orders > 0) return completed;
  return enqueueJob({
    type: "NETO_SYNC",
    payload: { kind: "full", from: FULL_SYNC_FROM, to: storeIsoDate() },
    createdById,
    total: 100,
  });
}
