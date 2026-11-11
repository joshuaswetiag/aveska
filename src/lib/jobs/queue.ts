import { prisma } from "@/lib/db";
import type { JobType } from "@prisma/client";
import { parseSpreadsheet } from "@/lib/import/parse-file";
import { importCatalogue, importOrders, importSuppressions } from "@/lib/import/run-import";
import type { ColumnMapping } from "@/types";
import { extractCatalogueFitments, extractOrderVehicles } from "@/lib/vehicle/persist";
import { generateRecommendations } from "@/lib/recommendation/generate";
import { generateCampaign } from "@/lib/campaign/generate";
import { runDemo } from "@/lib/demo/run-demo";
import { readUpload } from "@/lib/storage";

export async function enqueueJob(input: {
  type: JobType;
  payload?: object;
  importJobId?: string;
  createdById?: string;
  total?: number;
}) {
  return prisma.job.create({
    data: {
      type: input.type,
      payload: input.payload as object | undefined,
      importJobId: input.importJobId,
      createdById: input.createdById,
      total: input.total ?? 0,
      status: "QUEUED",
      message: "Waiting for worker…",
    },
  });
}

function jobMeta(payload: unknown): { attempts?: number; nextRunAt?: string } {
  if (!payload || typeof payload !== "object") return {};
  return payload as { attempts?: number; nextRunAt?: string };
}

export async function processNextJob(jobId?: string) {
  const staleBefore = new Date(Date.now() - 45_000);
  const now = Date.now();
  const job = jobId
    ? await prisma.job.findUnique({ where: { id: jobId } })
    : (
        await prisma.job.findMany({
          where: {
            OR: [{ status: "QUEUED" }, { status: "RUNNING", updatedAt: { lt: staleBefore } }],
          },
          orderBy: { createdAt: "asc" },
          take: 20,
        })
      ).find((row) => {
        const next = jobMeta(row.payload).nextRunAt;
        return !(row.status === "QUEUED" && next && Date.parse(next) > now);
      }) ?? null;
  if (!job || job.status === "COMPLETED" || job.status === "CANCELLED") return job?.id ?? null;
  if (job.status === "QUEUED") {
    const next = jobMeta(job.payload).nextRunAt;
    if (next && Date.parse(next) > Date.now()) return job.id;
  }
  if (job.status === "FAILED" && !jobId) return null;
  if (job.status !== "QUEUED" && job.status !== "RUNNING" && job.status !== "FAILED") return null;

  const inflight = (globalThis as { aveskaJobsInFlight?: Set<string> }).aveskaJobsInFlight ?? new Set<string>();
  (globalThis as { aveskaJobsInFlight?: Set<string> }).aveskaJobsInFlight = inflight;
  if (inflight.has(job.id)) return job.id;
  if (job.status === "RUNNING" && Date.now() - job.updatedAt.getTime() < 45_000) return job.id;
  const reclaimAttempts = job.status === "RUNNING" ? (jobMeta(job.payload).attempts ?? 0) + 1 : 0;
  if (job.status === "RUNNING" && reclaimAttempts >= 5) {
    await prisma.job.updateMany({
      where: { id: job.id, status: "RUNNING", updatedAt: job.updatedAt },
      data: {
        status: "FAILED",
        errorMessage: "Stopped after the job crashed repeatedly",
        completedAt: new Date(),
        payload: { ...((job.payload ?? {}) as object), attempts: reclaimAttempts },
      },
    });
    return job.id;
  }
  inflight.add(job.id);

  try {
    const claimed = await prisma.job.updateMany({
      where:
        job.status === "RUNNING"
          ? { id: job.id, status: "RUNNING", updatedAt: job.updatedAt }
          : { id: job.id, status: job.status === "FAILED" ? "FAILED" : "QUEUED" },
      data: {
        ...(job.progress > 0
          ? { status: "RUNNING" as const, errorMessage: null }
          : { status: "RUNNING" as const, startedAt: new Date(), message: "Starting…", errorMessage: null }),
        ...(reclaimAttempts > 0
          ? { payload: { ...((job.payload ?? {}) as object), attempts: reclaimAttempts } }
          : {}),
      },
    });
    if (claimed.count === 0) return job.id;

    let lastProgressAt = 0;
    let lastProgressDone = -1;
    const progress = async (done: number, total: number, message?: string) => {
      const now = Date.now();
      const jumped = Math.abs(done - lastProgressDone) >= Math.max(1, Math.floor(total / 50));
      if (now - lastProgressAt < 750 && !jumped && done < total) return;
      lastProgressAt = now;
      lastProgressDone = done;
      await prisma.job.update({
        where: { id: job.id },
        data: { progress: done, total, message: message ?? `Processing ${done} / ${total}` },
      });
      if (job.importJobId) {
        await prisma.importJob.update({
          where: { id: job.importJobId },
          data: { processedRows: done, totalRows: total, status: "PROCESSING" },
        });
      }
    };

    let result: object = {};
    if (job.type === "IMPORT" && job.importJobId) {
      const importJob = await prisma.importJob.findUniqueOrThrow({ where: { id: job.importJobId } });
      if (!importJob.filePath || !importJob.columnMapping) throw new Error("Import is missing file or column mapping");
      const buffer = await readUpload(importJob.filePath);
      const uploadPath = importJob.filePath;
      const parsed = await parseSpreadsheet(buffer, importJob.fileName);
      await progress(0, parsed.rows.length, "Importing rows");
      const mapping = importJob.columnMapping as ColumnMapping;
      if (importJob.type === "ORDERS") result = await importOrders(importJob.id, parsed.rows, mapping);
      else if (importJob.type === "CATALOGUE") result = await importCatalogue(importJob.id, parsed.rows, mapping);
      else result = (await importSuppressions(importJob.id, parsed.rows, mapping), { ok: true });
      const { deleteUpload } = await import("@/lib/storage");
      await deleteUpload(uploadPath).catch(() => undefined);
    } else if (job.type === "EXTRACT_VEHICLES") {
      await extractCatalogueFitments(progress);
      await extractOrderVehicles(progress);
      result = { ok: true };
    } else if (job.type === "GENERATE_RECOMMENDATIONS" || job.type === "ANALYSE_CUSTOMERS") {
      const payload = (job.payload ?? {}) as { cursor?: string | null; phase?: string };
      if (job.type === "ANALYSE_CUSTOMERS" && payload.phase !== "recommendations") {
        await extractCatalogueFitments(progress);
        await extractOrderVehicles(progress);
        await prisma.job.updateMany({
          where: { id: job.id, status: "RUNNING" },
          data: {
            status: "QUEUED",
            payload: { ...payload, phase: "recommendations", cursor: null },
            message: "Continuing recommendations…",
          },
        });
        return job.id;
      }
      const pass = await generateRecommendations({
        onProgress: progress,
        cursor: payload.cursor,
        maxCustomers: 25,
      });
      if (!pass.finished) {
        await prisma.job.updateMany({
          where: { id: job.id, status: "RUNNING" },
          data: {
            status: "QUEUED",
            payload: { ...payload, phase: "recommendations", cursor: pass.cursor },
            message: "Continuing recommendations…",
          },
        });
        return job.id;
      }
      result = pass;
    } else if (job.type === "GENERATE_CAMPAIGN") {
      const payload = (job.payload ?? {}) as {
        name: string;
        customerIds?: string[];
        vehicleId?: string;
        segmentId?: string;
        type?: "CROSS_SELL";
        from?: string;
        to?: string;
      };
      const campaign = await generateCampaign(payload, progress);
      const recipients = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id } });
      const stats = (campaign as { generateStats?: Record<string, unknown> }).generateStats;
      result = { campaignId: campaign.id, recipients, ...stats };
    } else if (job.type === "NETO_SYNC") {
      const payload = (job.payload ?? {}) as {
        kind?: string;
        from?: string;
        to?: string;
        phase?: string;
        productPage?: number;
        orderPage?: number;
        orderPass?: "placed" | "updated";
        importedProducts?: number;
        importedOrders?: number;
        refreshNeto?: boolean;
      };
      if (payload.kind === "full") {
        const { runFullSyncForRuntime } = await import("@/lib/catalogue/full-sync");
        const advanced = await runFullSyncForRuntime(
          {
            kind: "full",
            from: payload.from,
            to: payload.to,
            phase: (payload.phase as "products" | "orders" | "vehicles" | "links" | "recommendations" | "done" | undefined) ?? "products",
            recommendationCursor: (payload as { recommendationCursor?: string | null }).recommendationCursor,
            fitmentCursor: (payload as { fitmentCursor?: string | null }).fitmentCursor,
            linkCursor: (payload as { linkCursor?: string | null }).linkCursor,
            productPage: payload.productPage,
            orderPage: payload.orderPage,
            orderPass: payload.orderPass,
            importedProducts: payload.importedProducts,
            importedOrders: payload.importedOrders,
            refreshNeto: payload.refreshNeto,
            pageSize: (payload as { pageSize?: number }).pageSize,
          },
          progress,
          async (state) => {
            const saved = await prisma.job.updateMany({
              where: { id: job.id, status: "RUNNING" },
              data: {
                payload: state as object,
                message:
                  state.phase === "orders"
                    ? `Imported ${(state.importedOrders ?? 0).toLocaleString()} orders`
                    : state.phase === "vehicles" || state.phase === "links"
                      ? "Matching vehicles…"
                      : `Imported ${(state.importedProducts ?? 0).toLocaleString()} live products`,
              },
            });
            if (saved.count === 0) throw new Error("Sync was cancelled");
          },
        );
        if (!advanced.done) {
          await prisma.job.updateMany({
            where: { id: job.id, status: "RUNNING" },
            data: {
              status: "QUEUED",
              payload: advanced.payload as object,
              message: "Continuing sync…",
              errorMessage: null,
            },
          });
          return job.id;
        }
        result = advanced.result as object;
      } else if (payload.kind === "orders") {
        const { syncNetoOrders } = await import("@/lib/catalogue/neto-orders");
        result = await syncNetoOrders(progress, { from: payload.from, to: payload.to });
      } else {
        const { syncNetoCatalogue } = await import("@/lib/catalogue/neto");
        const chunk = await syncNetoCatalogue(progress, {
          extractVehicles: true,
          startPage: payload.productPage ?? 0,
          importedSoFar: payload.importedProducts ?? 0,
          timeBudgetMs: (globalThis as { aveskaD1?: unknown }).aveskaD1 ? 12_000 : undefined,
          maxPages: (globalThis as { aveskaD1?: unknown }).aveskaD1 ? 3 : undefined,
        });
        if (!chunk.done) {
          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "QUEUED",
              payload: {
                ...payload,
                productPage: chunk.nextPage,
                importedProducts: chunk.imported,
              } as object,
              message: "Continuing catalogue sync…",
              errorMessage: null,
            },
          });
          return job.id;
        }
        result = chunk;
      }
    } else if (job.type === "DEMO") {
      result = await runDemo(progress);
    } else if (job.type === "SEND_CAMPAIGN") {
      const payload = (job.payload ?? {}) as { campaignId?: string; testTo?: string; recipientId?: string };
      if (!payload.campaignId) throw new Error("Send job is missing campaignId");
      await progress(0, job.total || 1, "Loading campaign…");
      const { sendCampaign } = await import("@/lib/campaign/send");
      result = await sendCampaign(payload.campaignId, {
        testTo: payload.testTo,
        recipientId: payload.recipientId,
        onProgress: progress,
      });
      if ((result as { paused?: boolean }).paused) {
        await prisma.job.updateMany({
          where: { id: job.id, status: "RUNNING" },
          data: { status: "QUEUED", message: "Continuing send…", result: result as object },
        });
        return job.id;
      }
    } else if (job.type === "SEGMENT_CUSTOMERS") {
      const { segmentCustomers } = await import("@/lib/recommendation/generate");
      await segmentCustomers();
      result = { ok: true };
    }

    const latest = await prisma.job.findUnique({
      where: { id: job.id },
      select: { progress: true, total: true, message: true },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        result,
        message: latest?.message && latest.message !== "Starting…" ? latest.message : "Completed",
        progress: latest?.progress || 1,
        total: latest?.total || 1,
      },
    });
    return job.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    const current = await prisma.job.findUnique({ where: { id: job.id }, select: { status: true } });
    if (message === "Sync was cancelled" || current?.status === "CANCELLED") return job.id;
    const attempts = (jobMeta(job.payload).attempts ?? 0) + 1;
    if (job.type === "NETO_SYNC" && attempts < 5 && current?.status === "RUNNING") {
      const delayMs = Math.min(30, 2 ** attempts) * 60_000;
      await prisma.job.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "QUEUED",
          errorMessage: message,
          payload: {
            ...((job.payload ?? {}) as object),
            attempts,
            nextRunAt: new Date(Date.now() + delayMs).toISOString(),
          },
        },
      });
      return job.id;
    }
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date(), payload: { ...((job.payload ?? {}) as object), attempts } },
    });
    if (job.importJobId) {
      await prisma.importJob.update({
        where: { id: job.importJobId },
        data: { status: "FAILED", errorMessage: message },
      });
    }
    throw error;
  } finally {
    const inflight = (globalThis as { aveskaJobsInFlight?: Set<string> }).aveskaJobsInFlight;
    inflight?.delete(job.id);
  }
}
