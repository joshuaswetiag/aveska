import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enqueueJob, processNextJob } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!process.env.NETO_API_KEY) {
    return NextResponse.json({ error: "NETO_API_KEY is not configured" }, { status: 400 });
  }
  const job = await enqueueJob({ type: "NETO_SYNC", createdById: session.user.id, total: 12642 });
  await audit({ userId: session.user.id, action: "neto_sync", entityType: "Job", entityId: job.id });
  void processNextJob(job.id).catch(() => undefined);
  return NextResponse.json({ jobId: job.id });
}
