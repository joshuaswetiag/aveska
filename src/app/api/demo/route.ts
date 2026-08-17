import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enqueueJob } from "@/lib/jobs/queue";
import { runJobInBackground } from "@/lib/jobs/run-in-background";
import { audit } from "@/lib/audit";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const job = await enqueueJob({ type: "DEMO", createdById: session.user.id });
  await audit({ userId: session.user.id, action: "demo", entityType: "Job", entityId: job.id });
  runJobInBackground(job.id);
  return NextResponse.json({ jobId: job.id });
}
