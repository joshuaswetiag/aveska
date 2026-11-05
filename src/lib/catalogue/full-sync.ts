import { storeIsoDate } from "@/lib/utils";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { syncNetoCatalogue } from "@/lib/catalogue/neto";
import { syncNetoOrders } from "@/lib/catalogue/neto-orders";
import { extractCatalogueFitments, extractCatalogueFitmentChunk, harvestVehiclesFromOrderLines, linkOrderVehiclesChunk } from "@/lib/vehicle/persist";

/** Default order history window for first-load sync (override with NETO_ORDERS_FROM). */
function defaultOrdersFrom() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 3);
  return date.toISOString().slice(0, 10);
}

export const FULL_SYNC_FROM = process.env.NETO_ORDERS_FROM?.trim() || defaultOrdersFrom();

export type FullSyncPayload = {
  kind: "full";
  from?: string;
  to?: string;
  phase?: "products" | "orders" | "vehicles" | "links" | "recommendations" | "done";
  recommendationCursor?: string | null;
  productPage?: number;
  orderPage?: number;
  fitmentCursor?: string | null;
  linkCursor?: string | null;
  importedProducts?: number;
  importedOrders?: number;
  productTotal?: number;
  pageSize?: number;
  refreshNeto?: boolean;
};

export function isFullSyncJob(payload: unknown) {
  return Boolean(payload && typeof payload === "object" && (payload as { kind?: string }).kind === "full");
}

function isWorkerRuntime() {
  if (process.env.AVESKA_RUNTIME === "worker") return true;
  const g = globalThis as {
    aveskaD1?: unknown;
    Cloudflare?: unknown;
  };
  return Boolean(g.aveskaD1 || g.Cloudflare);
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

/** Local / long-running full sync (Node). */
export async function syncFullAveskaStore(
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
  options?: { refreshNeto?: boolean },
) {
  const to = storeIsoDate();
  const from = FULL_SYNC_FROM;
  const [productCount, orderCount] = await Promise.all([prisma.product.count(), prisma.order.count()]);

  let catalogue: unknown = { skipped: true, imported: productCount };
  if (options?.refreshNeto || productCount < 1000) {
    await onProgress?.(1, 100, "Syncing live Aveska products…");
    catalogue = await scaled(1, 34, onProgress, (progress) =>
      syncNetoCatalogue(progress, { extractVehicles: false }),
    );
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

  const vehicleCount = await prisma.vehicle.count();
  if (vehicleCount < 3500) {
    await onProgress?.(77, 100, "Matching vehicles from every product…");
    await extractCatalogueFitments(async (done, total) => {
      await onProgress?.(77 + Math.round((done / Math.max(total, 1)) * 11), 100, "Matching vehicles from every product…");
    });
  } else {
    await onProgress?.(88, 100, "Product vehicles already matched");
  }

  await onProgress?.(88, 100, "Matching extra vehicles from orders…");
  await harvestVehiclesFromOrderLines(async (done, total, message) => {
    await onProgress?.(88 + Math.round((done / Math.max(total, 1)) * 11), 100, message);
  });

  await onProgress?.(100, 100, "Aveska store loaded");
  return { catalogue, orders, from, to };
}

/**
 * One short chunk of full sync for Cloudflare Workers (avoids request cancel / hang).
 * Persist returned payload on the job and re-queue until done.
 */
export async function advanceFullSync(
  payload: FullSyncPayload,
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
  timeBudgetMs = 20_000,
  persist?: (state: FullSyncPayload) => Promise<void>,
) {
  // Shorter history on Workers so first load finishes much faster.
  const defaultFrom = (() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 18);
    return date.toISOString().slice(0, 10);
  })();
  // A one-day window (from === to) was stored on a stuck job. Expand it so order history actually syncs.
  const windowTooSmall =
    Boolean(payload.from && payload.to && payload.from >= payload.to) ||
    Boolean(payload.from && payload.to && Date.parse(payload.to) - Date.parse(payload.from) < 30 * 86400000);
  const from = windowTooSmall ? defaultFrom : payload.from || process.env.NETO_ORDERS_FROM?.trim() || defaultFrom;
  const to = payload.to || storeIsoDate();
  const state: FullSyncPayload = {
    ...payload,
    kind: "full",
    from,
    to,
    phase: payload.phase ?? "products",
    productPage: payload.productPage ?? 0,
    orderPage: payload.orderPage ?? 0,
    importedProducts: payload.importedProducts ?? 0,
    importedOrders: payload.importedOrders ?? 0,
  };
  const started = Date.now();
  const remaining = () => Math.max(2_000, timeBudgetMs - (Date.now() - started));

  if (state.phase === "products") {
    // Always pull the full Neto catalogue (chunked). Do not stop early on a partial count.
    await onProgress?.(1, 100, "Syncing live Aveska products…");
      const pageSize = state.pageSize || 80;
      state.pageSize = pageSize;
      const chunk = await syncNetoCatalogue(
        async (done, total, message) => {
          const pct = 1 + Math.round((done / Math.max(total, 1)) * 34);
          await onProgress?.(Math.min(35, pct), 100, message);
        },
        {
          extractVehicles: false,
          startPage: state.productPage ?? 0,
          timeBudgetMs: remaining(),
          importedSoFar: state.importedProducts ?? 0,
          maxPages: 2,
          pageSize,
          onPage: async (info) => {
            state.productPage = info.nextPage;
            state.importedProducts = info.imported;
            state.productTotal = info.total;
            await persist?.(state);
          },
        },
      );
    state.importedProducts = chunk.imported;
    state.productPage = chunk.nextPage;
    state.productTotal = chunk.total;
    if (!chunk.done) {
      return { done: false, payload: state, result: chunk };
    }
    state.phase = "orders";
    state.orderPage = 0;
  }

  if (state.phase === "orders" && remaining() > 2_000) {
      const chunk = await syncNetoOrders(
        async (done, _total, message) => {
          const pct = 36 + Math.min(39, Math.round(done / 50));
          await onProgress?.(Math.min(76, pct), 100, message);
        },
        {
          from,
          to,
          startPage: state.orderPage ?? 0,
          timeBudgetMs: remaining(),
          importedSoFar: state.importedOrders ?? 0,
          maxPages: 2,
          skipBackfill: true,
          onPage: async (info) => {
            state.orderPage = info.nextPage;
            state.importedOrders = info.imported;
            await persist?.(state);
          },
        },
      );
      state.importedOrders = chunk.imported;
      state.orderPage = chunk.nextPage;
      if (!chunk.done) {
        return { done: false, payload: state, result: chunk };
      }
      state.phase = "vehicles";
      state.fitmentCursor = null;
  }

  if (state.phase === "vehicles" && remaining() > 2_000) {
    while (remaining() > 2_000) {
      const chunk = await extractCatalogueFitmentChunk(state.fitmentCursor, 30);
      state.fitmentCursor = chunk.nextCursor;
      await onProgress?.(82, 100, "Matching vehicles from products");
      await persist?.(state);
      if (chunk.done || chunk.count === 0) {
        state.phase = "links";
        state.linkCursor = null;
        break;
      }
    }
    if (state.phase === "vehicles") return { done: false, payload: state, result: { phase: "vehicles" } };
  }

  if (state.phase === "links" && remaining() > 2_000) {
    while (remaining() > 2_000) {
      const chunk = await linkOrderVehiclesChunk(state.linkCursor, 60);
      state.linkCursor = chunk.nextCursor;
      await onProgress?.(92, 100, "Linking customers to vehicles");
      await persist?.(state);
      if (chunk.done || chunk.count === 0) {
        state.phase = "recommendations";
        state.recommendationCursor = null;
        break;
      }
    }
    if (state.phase === "links") return { done: false, payload: state, result: { phase: "links" } };
  }

  if (state.phase === "recommendations" && remaining() > 2_000) {
    const { generateRecommendations } = await import("@/lib/recommendation/generate");
    const pass = await generateRecommendations({
      resume: true,
      skipSegments: true,
      maxCustomers: 20,
      cursor: state.recommendationCursor,
    });
    state.recommendationCursor = pass.cursor;
    await onProgress?.(96, 100, "Building recommendations");
    await persist?.(state);
    if (!pass.finished) return { done: false, payload: state, result: { phase: "recommendations" } };
    state.phase = "done";
  }

  if (state.phase === "done") {
    await onProgress?.(100, 100, "Aveska store loaded");
    return {
      done: true,
      payload: state,
      result: {
        from,
        to,
        products: state.importedProducts,
        orders: state.importedOrders,
        workerChunked: true,
      },
    };
  }

  return { done: false, payload: state, result: { waiting: true } };
}

export async function runFullSyncForRuntime(
  payload: FullSyncPayload,
  onProgress?: (done: number, total: number, message?: string) => Promise<void>,
  persist?: (state: FullSyncPayload) => Promise<void>,
) {
  if (isWorkerRuntime()) {
    return advanceFullSync(payload, onProgress, 20_000, persist);
  }
  const result = await syncFullAveskaStore(onProgress, { refreshNeto: payload.refreshNeto });
  return { done: true as const, payload: { ...payload, phase: "done" as const }, result };
}

export async function listFullSyncJobs() {
  try {
    return await prisma.job.findMany({
      where: {
        type: "NETO_SYNC",
        payload: { path: "$.kind", equals: "full" },
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
  const activeJobs = fullJobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING");
  if (activeJobs.length > 1) {
    await prisma.job.updateMany({
      where: { id: { in: activeJobs.slice(1).map((job) => job.id) } },
      data: { status: "CANCELLED", message: "Superseded" },
    });
  }
  if (activeJobs[0]) return activeJobs[0];
  const failed = fullJobs.find((job) => job.status === "FAILED");
  if (failed && !force) {
    const attempts = Number((failed.payload as { attempts?: number } | null)?.attempts ?? 0);
    if (attempts >= 5) return failed;
    await prisma.job.update({
      where: { id: failed.id },
      data: { status: "QUEUED", errorMessage: null, message: "Resuming sync…" },
    });
    return failed;
  }
  const [products, orders] = await Promise.all([prisma.product.count(), prisma.order.count()]);
  const completed = fullJobs.find((job) => job.status === "COMPLETED");
  if (!force && products > 0 && orders > 0) return completed ?? null;
  return enqueueJob({
    type: "NETO_SYNC",
    payload: {
      kind: "full",
      from: isWorkerRuntime() && !process.env.NETO_ORDERS_FROM?.trim()
        ? (() => {
            const date = new Date();
            date.setMonth(date.getMonth() - 18);
            return date.toISOString().slice(0, 10);
          })()
        : FULL_SYNC_FROM,
      to: storeIsoDate(),
      phase: "products",
      productPage: 0,
      orderPage: 0,
    } satisfies FullSyncPayload,
    createdById,
    total: 100,
  });
}
