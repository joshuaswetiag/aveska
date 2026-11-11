import { NextResponse } from "@/server/next-response";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { startJobWorker } from "@/lib/jobs/worker";
import { fullSyncFrom, ensureFullSyncQueued, listFullSyncJobs } from "@/lib/catalogue/full-sync";
import { fromCents } from "@/lib/money";
import { internalError } from "@/server/http-error";
import { storeIsoDate } from "@/lib/utils";
import { readEnv } from "@/lib/read-env";

export const dynamic = "force-dynamic";

function serializeJob(job: {
  id: string;
  status: string;
  progress: number;
  total: number;
  message: string | null;
  errorMessage: string | null;
} | null) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    total: job.total,
    message: job.message,
    errorMessage: job.errorMessage,
  };
}

async function counts() {
  const [customers, orders, products, vehicles, recommendations, revenue] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.vehicle.count(),
    prisma.recommendation.count(),
    prisma.order.aggregate({ _sum: { orderTotal: true } }),
  ]);
  return {
    customers,
    orders,
    products,
    vehicles,
    recommendations,
    revenue: fromCents(Number(revenue._sum.orderTotal ?? 0)) ?? 0,
  };
}

function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return json({ error: "Unauthorized" }, 401);
    startJobWorker();
    const { ensureJobTypeEnum } = await import("@/lib/ensure-job-types");
    await ensureJobTypeEnum();
    const stats = await counts();
    // Secrets are injected per-request on Workers; existing catalogue also means Neto was configured.
    const netoConfigured = Boolean(readEnv("NETO_API_KEY")?.trim()) || stats.products > 0;
    let job = null as Awaited<ReturnType<typeof ensureFullSyncQueued>>;
    let enqueueError = "";
    if (!readEnv("NETO_API_KEY")?.trim() && stats.products === 0 && stats.orders === 0) {
      return json({
        ready: true,
        netoConfigured: false,
        needsSync: false,
        enqueueError: "Add a Neto API key or import a catalogue CSV.",
        workerStarted: Boolean(globalThis.aveskaJobWorkerStarted),
        job: null,
        counts: stats,
        from: fullSyncFrom(),
        to: storeIsoDate(),
      });
    }
    if (!readEnv("NETO_API_KEY")?.trim() && stats.products === 0) {
      enqueueError = "NETO_API_KEY is not set on this running app.";
    } else if (!readEnv("NETO_API_KEY")?.trim() && stats.products > 0) {
      // Key missing this request but store already has data — don't block the UI.
      enqueueError = "";
    }
    if (session.user.role !== "READONLY" && readEnv("NETO_API_KEY")?.trim()) {
      try {
        job = await ensureFullSyncQueued(session.user.id);
      } catch (error) {
        enqueueError = internalError("Could not queue full sync", error);
      }
    }
    const fullJobs = await listFullSyncJobs().catch(() => []);
    const active = fullJobs.find((row) => row.status === "QUEUED" || row.status === "RUNNING") ?? null;
    const completed = fullJobs.find((row) => row.status === "COMPLETED") ?? null;
    const failed = !active ? fullJobs.find((row) => row.status === "FAILED") ?? null : null;
    // Open the dashboard once we have real data; remaining sync can finish in the background.
    const ready =
      stats.products > 0 &&
      stats.orders > 0 &&
      (!active || (stats.products >= 400 && stats.orders >= 25));
    return json({
      ready,
      netoConfigured,
      needsSync: !ready,
      enqueueError: enqueueError || null,
      workerStarted: Boolean(globalThis.aveskaJobWorkerStarted),
      job: serializeJob(active ?? failed ?? completed ?? job),
      counts: stats,
      from: fullSyncFrom(),
      to: storeIsoDate(),
    });
  } catch (error) {
    const message = internalError("GET /api/bootstrap", error);
    return json(
      {
        error: message,
        ready: false,
        netoConfigured: Boolean(readEnv("NETO_API_KEY")?.trim()),
        needsSync: true,
        job: null,
        counts: { customers: 0, orders: 0, products: 0, vehicles: 0, recommendations: 0, revenue: 0 },
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return json({ error: "Unauthorized" }, 401);
  if (session.user.role === "READONLY") return json({ error: "Forbidden" }, 403);
  if (!readEnv("NETO_API_KEY")?.trim()) {
    return json({ error: "NETO_API_KEY is not configured" }, 400);
  }
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  startJobWorker();
  const { ensureJobTypeEnum } = await import("@/lib/ensure-job-types");
  await ensureJobTypeEnum();
  const stats = await counts();
  try {
    const job = await ensureFullSyncQueued(session.user.id, Boolean(body.force));
    return json({ jobId: job?.id ?? null, started: Boolean(job), job: serializeJob(job), counts: stats });
  } catch (error) {
    const message = internalError("POST /api/bootstrap", error);
    return json({ error: message, jobId: null, started: false, counts: stats }, 500);
  }
}
