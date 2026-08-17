import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enqueueJob, processNextJob } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const job = await enqueueJob({ type: "ANALYSE_CUSTOMERS", createdById: session.user.id });
  await audit({ userId: session.user.id, action: "analyse", entityType: "Job", entityId: job.id });
  void processNextJob(job.id).catch(() => undefined);
  return NextResponse.json({ jobId: job.id });
}
