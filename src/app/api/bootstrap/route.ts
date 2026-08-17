import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { runJobInBackground } from "@/lib/jobs/run-in-background";
import { startJobWorker } from "@/lib/jobs/worker";
import { FULL_SYNC_FROM, ensureFullSyncQueued, listFullSyncJobs } from "@/lib/catalogue/full-sync";
import { storeIsoDate } from "@/lib/utils";

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
    revenue: Number(revenue._sum.orderTotal ?? 0),
  };
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const netoConfigured = Boolean(process.env.NETO_API_KEY?.trim());
    const stats = await counts();
    startJobWorker();
    let job = null as Awaited<ReturnType<typeof ensureFullSyncQueued>>;
    if (netoConfigured) {
      try {
        job = await ensureFullSyncQueued(session.user.id);
      } catch (error) {
        console.error("Could not queue full sync", error);
      }
    }
    const fullJobs = await listFullSyncJobs().catch(() => []);
    const active = fullJobs.find((row) => row.status === "QUEUED" || row.status === "RUNNING") ?? null;
    const completed = fullJobs.find((row) => row.status === "COMPLETED") ?? null;
    const failed = !active ? fullJobs.find((row) => row.status === "FAILED") ?? null : null;
    const ready = !active && Boolean(completed) && stats.products > 0 && stats.orders > 0;
    return NextResponse.json({
      ready,
      netoConfigured,
      needsSync: !ready,
      job: active ?? failed ?? completed ?? job,
      counts: stats,
      from: FULL_SYNC_FROM,
      to: storeIsoDate(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap check failed";
    console.error("GET /api/bootstrap", error);
    return NextResponse.json(
      {
        error: message,
        ready: false,
        netoConfigured: Boolean(process.env.NETO_API_KEY?.trim()),
        needsSync: true,
        job: null,
        counts: { customers: 0, orders: 0, products: 0, vehicles: 0, recommendations: 0, revenue: 0 },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.NETO_API_KEY?.trim()) {
    return NextResponse.json({ error: "NETO_API_KEY is not configured" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  startJobWorker();
  const stats = await counts();
  const job = await ensureFullSyncQueued(session.user.id, Boolean(body.force));
  if (job && job.status === "QUEUED") {
    runJobInBackground(job.id);
  }
  return NextResponse.json({ jobId: job?.id ?? null, started: Boolean(job), counts: stats });
}
