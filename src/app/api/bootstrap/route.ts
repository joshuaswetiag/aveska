import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs/queue";
import { runJobInBackground } from "@/lib/jobs/run-in-background";
import { FULL_SYNC_FROM } from "@/lib/catalogue/full-sync";
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

async function latestFullJobs() {
  return prisma.job.findMany({
    where: {
      type: "NETO_SYNC",
      payload: { path: ["kind"], equals: "full" },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const netoConfigured = Boolean(process.env.NETO_API_KEY?.trim());
  const stats = await counts();
  const fullJobs = await latestFullJobs();
  const active = fullJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING");
  const completed = fullJobs.find((job) => job.status === "COMPLETED");
  const failed = !active ? fullJobs.find((job) => job.status === "FAILED") : undefined;
  const ready = !active && Boolean(completed) && stats.products > 0 && stats.orders > 0;
  return NextResponse.json({
    ready,
    netoConfigured,
    needsSync: !ready,
    job: active ?? failed ?? completed ?? null,
    counts: stats,
    from: FULL_SYNC_FROM,
    to: storeIsoDate(),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.NETO_API_KEY?.trim()) {
    return NextResponse.json({ error: "NETO_API_KEY is not configured" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { force?: boolean };
  const stats = await counts();
  const fullJobs = await latestFullJobs();
  const active = fullJobs.find((job) => job.status === "QUEUED" || job.status === "RUNNING");
  const completed = fullJobs.find((job) => job.status === "COMPLETED");
  if (active) {
    return NextResponse.json({ jobId: active.id, started: false, counts: stats });
  }
  if (completed && stats.products > 0 && stats.orders > 0 && !body.force) {
    return NextResponse.json({ jobId: completed.id, started: false, ready: true, counts: stats });
  }
  const job = await enqueueJob({
    type: "NETO_SYNC",
    payload: { kind: "full", from: FULL_SYNC_FROM, to: storeIsoDate() },
    createdById: session.user.id,
    total: 100,
  });
  runJobInBackground(job.id);
  return NextResponse.json({ jobId: job.id, started: true, counts: stats });
}
