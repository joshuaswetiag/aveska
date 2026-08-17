import { storeIsoDate } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { syncNetoCatalogue } from "@/lib/catalogue/neto";
import { syncNetoOrders } from "@/lib/catalogue/neto-orders";
import { extractCatalogueFitments, backfillCustomerVehiclesFromOrders } from "@/lib/vehicle/persist";
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
  options?: { refreshNeto?: boolean },
) {
  const to = storeIsoDate();
  const from = FULL_SYNC_FROM;
  const [productCount, orderCount, recCount, fitmentCount, customerVehicleCount] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.recommendation.count(),
    prisma.productFitment.count(),
    prisma.customerVehicle.count(),
  ]);

  let catalogue: unknown = { skipped: true, imported: productCount };
  if (options?.refreshNeto || productCount < 1000) {
    await onProgress?.(1, 100, "Syncing live Aveska products…");
    catalogue = await scaled(1, 34, onProgress, (progress) => syncNetoCatalogue(progress));
  } else {
    await onProgress?.(35, 100, `Using ${productCount.toLocaleString()} products already synced`);
  }

  let orders: unknown = { skipped: true, imported: orderCount };
  if (options?.refreshNeto || orderCount < 1000) {
    await onProgress?.(36, 100, "Syncing customers, orders, and revenue…");
    orders = await scaled(36, 40, onProgress, (progress) => syncNetoOrders(progress, { from, to }));
  } else {
    await onProgress?.(76, 100, `Using ${orderCount.toLocaleString()} orders already synced`);
  }

  if (options?.refreshNeto || fitmentCount < 500) {
    await onProgress?.(77, 100, "Matching vehicles from the catalogue…");
    await extractCatalogueFitments(async (done, total) => {
      await onProgress?.(77 + Math.round((done / Math.max(total, 1)) * 6), 100, "Matching vehicles from the catalogue…");
    });
  } else {
    await onProgress?.(83, 100, "Vehicle catalogue already matched");
  }

  if (options?.refreshNeto || customerVehicleCount < 500) {
    await onProgress?.(84, 100, "Matching vehicles from orders…");
    await backfillCustomerVehiclesFromOrders(async (done, total, message) => {
      await onProgress?.(84 + Math.round((done / Math.max(total, 1)) * 6), 100, message);
    });
  } else {
    await onProgress?.(90, 100, "Customer vehicles already linked");
  }

  let recommendations: unknown = { skipped: true, recommendations: recCount };
  const pendingRecCustomers = await prisma.customer.count({
    where: { vehicles: { some: {} }, recommendations: { none: {} } },
  });
  if (options?.refreshNeto || pendingRecCustomers > 0) {
    await onProgress?.(91, 100, "Building customer recommendations…");
    recommendations = await generateRecommendations({
      skipSegments: true,
      resume: true,
      onProgress: async (done, total) => {
        await onProgress?.(
          91 + Math.round((done / Math.max(total, 1)) * 8),
          100,
          `Building recommendations ${done.toLocaleString()} / ${Math.max(total, 1).toLocaleString()}`,
        );
      },
    });
  }

  await onProgress?.(100, 100, "Aveska store loaded");
  return { catalogue, orders, recommendations, from, to };
}

export async function listFullSyncJobs() {
  try {
    return await prisma.job.findMany({
      where: {
        type: "NETO_SYNC",
        payload: { path: ["kind"], equals: "full" },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch {
    const jobs = await prisma.job.findMany({
      where: { type: "NETO_SYNC" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return jobs.filter((job) => isFullSyncJob(job.payload));
  }
}

export async function ensureFullSyncQueued(createdById?: string, force = false) {
  if (!process.env.NETO_API_KEY?.trim()) return null;
  const fullJobs = await listFullSyncJobs();
  const active = fullJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING");
  if (active) return active;
  const [products, orders, pendingRecCustomers] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.customer.count({ where: { vehicles: { some: {} }, recommendations: { none: {} } } }),
  ]);
  const completed = fullJobs.find((job) => job.status === "COMPLETED");
  if (!force && completed && products > 0 && orders > 0 && pendingRecCustomers < 50) return completed;
  if (!force && products > 0 && orders > 0 && pendingRecCustomers < 50) return completed ?? null;
  return enqueueJob({
    type: "NETO_SYNC",
    payload: { kind: "full", from: FULL_SYNC_FROM, to: storeIsoDate() },
    createdById,
    total: 100,
  });
}
