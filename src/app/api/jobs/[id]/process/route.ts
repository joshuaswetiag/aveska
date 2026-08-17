import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await processNextJob(id);
    return NextResponse.json(await prisma.job.findUnique({ where: { id } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
