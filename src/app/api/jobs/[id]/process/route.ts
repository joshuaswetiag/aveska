import { internalError } from "@/server/http-error";
import { NextResponse } from "@/server/next-response";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return NextResponse.json(job);
  }
  startJobWorker();
  try {
    await processNextJob(id);
  } catch (error) {
    const latest = await prisma.job.findUnique({ where: { id } });
    return NextResponse.json({ error: internalError("POST /api/jobs/process", error), job: latest }, { status: 500 });
  }
  return NextResponse.json(await prisma.job.findUnique({ where: { id } }));
}
