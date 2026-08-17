import { prisma } from "@/lib/db";
import type { JobType } from "@prisma/client";
import { parseSpreadsheet } from "@/lib/import/parse-file";
import { importCatalogue, importOrders, importSuppressions } from "@/lib/import/run-import";
import type { ColumnMapping } from "@/types";
import { extractCatalogueFitments, extractOrderVehicles } from "@/lib/vehicle/persist";
import { generateRecommendations } from "@/lib/recommendation/generate";
import { generateCampaign } from "@/lib/campaign/generate";
import { runDemo } from "@/lib/demo/run-demo";
import { readFile } from "fs/promises";

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

export async function processNextJob(jobId?: string) {
  const job = jobId
    ? await prisma.job.findUnique({ where: { id: jobId } })
    : await prisma.job.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });
  if (!job || job.status === "COMPLETED" || job.status === "CANCELLED") return job?.id ?? null;
  if (job.status !== "QUEUED" && job.status !== "RUNNING" && job.status !== "FAILED") return null;

  const inflight = (globalThis as { aveskaJobsInFlight?: Set<string> }).aveskaJobsInFlight ?? new Set<string>();
  (globalThis as { aveskaJobsInFlight?: Set<string> }).aveskaJobsInFlight = inflight;
  if (inflight.has(job.id)) return job.id;
  if (job.status === "RUNNING") {
    const staleMs = Date.now() - job.updatedAt.getTime();
    if (staleMs < 90_000) return job.id;
  }
  inflight.add(job.id);

  try {
    const claimed = await prisma.job.updateMany({
      where: {
        id: job.id,
        status: job.status === "RUNNING" ? "RUNNING" : { in: ["QUEUED", "FAILED"] },
      },
      data:
        job.progress > 0
          ? { status: "RUNNING", errorMessage: null }
          : { status: "RUNNING", startedAt: new Date(), message: "Starting…", errorMessage: null },
    });
    if (claimed.count === 0) return job.id;

    const progress = async (done: number, total: number, message?: string) => {
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
      const buffer = await readFile(importJob.filePath);
      const parsed = parseSpreadsheet(buffer, importJob.fileName);
      await progress(0, parsed.rows.length, "Importing rows");
      const mapping = importJob.columnMapping as ColumnMapping;
      if (importJob.type === "ORDERS") result = await importOrders(importJob.id, parsed.rows, mapping);
      else if (importJob.type === "CATALOGUE") result = await importCatalogue(importJob.id, parsed.rows, mapping);
      else result = (await importSuppressions(importJob.id, parsed.rows, mapping), { ok: true });
    } else if (job.type === "EXTRACT_VEHICLES") {
      await extractCatalogueFitments(progress);
      await extractOrderVehicles(progress);
      result = { ok: true };
    } else if (job.type === "GENERATE_RECOMMENDATIONS") {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "CANCELLED", message: "Recommendation generation is paused", completedAt: new Date() },
      });
      return job.id;
    } else if (job.type === "ANALYSE_CUSTOMERS") {
      await extractCatalogueFitments(progress);
      await extractOrderVehicles(progress);
      result = await generateRecommendations({ onProgress: progress });
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
      const payload = (job.payload ?? {}) as { kind?: string; from?: string; to?: string };
      if (payload.kind === "full") {
        const { syncFullAveskaStore } = await import("@/lib/catalogue/full-sync");
        result = await syncFullAveskaStore(progress);
      } else if (payload.kind === "orders") {
        const { syncNetoOrders } = await import("@/lib/catalogue/neto-orders");
        result = await syncNetoOrders(progress, { from: payload.from, to: payload.to });
      } else {
        const { syncNetoCatalogue } = await import("@/lib/catalogue/neto");
        result = await syncNetoCatalogue(progress);
      }
    } else if (job.type === "DEMO") {
      result = await runDemo(progress);
    } else if (job.type === "SEND_CAMPAIGN") {
      const payload = (job.payload ?? {}) as { campaignId?: string; testTo?: string; recipientId?: string };
      if (!payload.campaignId) throw new Error("Send job is missing campaignId");
      const { sendCampaign } = await import("@/lib/campaign/send");
      result = await sendCampaign(payload.campaignId, {
        testTo: payload.testTo,
        recipientId: payload.recipientId,
        onProgress: progress,
      });
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
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
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
