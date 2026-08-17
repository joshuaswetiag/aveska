import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enqueueJob, processNextJob } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";
import { parseOrderSyncRange } from "@/lib/catalogue/neto-orders";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.NETO_API_KEY) {
    return NextResponse.json({ error: "NETO_API_KEY is not configured" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
  const range = parseOrderSyncRange(body);
  if (body.from || body.to) {
    if (!range) {
      return NextResponse.json({ error: "Use dates like 2026-08-17 for From and To." }, { status: 400 });
    }
  }
  const job = await enqueueJob({
    type: "NETO_SYNC",
    payload: { kind: "orders", from: range?.from ?? null, to: range?.to ?? null },
    createdById: session.user.id,
  });
  await audit({
    userId: session.user.id,
    action: "neto_order_sync",
    entityType: "Job",
    entityId: job.id,
    metadata: { from: range?.from ?? null, to: range?.to ?? null },
  });
  void processNextJob(job.id).catch(() => undefined);
  return NextResponse.json({ jobId: job.id, from: range?.from ?? null, to: range?.to ?? null });
}
