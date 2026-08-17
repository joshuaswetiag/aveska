import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { runJobInBackground } from "@/lib/jobs/run-in-background";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return NextResponse.json(job);
  }
  if (job.status === "FAILED") {
    await prisma.job.update({
      where: { id },
      data: { status: "QUEUED", errorMessage: null, message: "Queued" },
    });
  }
  if (job.status === "QUEUED" || job.status === "FAILED") {
    runJobInBackground(id);
  }
  return NextResponse.json(await prisma.job.findUnique({ where: { id } }));
}
