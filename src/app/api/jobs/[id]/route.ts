import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await processNextJob(id);
    const job = await prisma.job.findUnique({ where: { id } });
    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
