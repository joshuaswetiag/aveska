import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { mappingIssues } from "@/lib/import/columns";
import type { ColumnMapping } from "@/types";
import { enqueueJob } from "@/lib/jobs/queue";
import { runJobInBackground } from "@/lib/jobs/run-in-background";
import { audit } from "@/lib/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const job = await prisma.importJob.findUnique({ where: { id }, include: { errors: { take: 50 } } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json()) as { mapping?: ColumnMapping; start?: boolean };
  const importJob = await prisma.importJob.findUnique({ where: { id } });
  if (!importJob) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.mapping) {
    const kind = importJob.type === "CATALOGUE" ? "catalogue" : "orders";
    const issues = mappingIssues(body.mapping, kind);
    if (issues.length && body.start) return NextResponse.json({ error: issues.join(". ") }, { status: 400 });
    await prisma.importJob.update({ where: { id }, data: { columnMapping: body.mapping as object, status: "MAPPING" } });
  }

  if (body.start) {
    const mapping = (body.mapping ?? importJob.columnMapping) as ColumnMapping | null;
    if (!mapping) return NextResponse.json({ error: "Column mapping is required" }, { status: 400 });
    await prisma.importJob.update({ where: { id }, data: { status: "PROCESSING", columnMapping: mapping as object } });
    const job = await enqueueJob({
      type: "IMPORT",
      importJobId: id,
      createdById: session.user.id,
      total: importJob.totalRows,
    });
    await audit({ userId: session.user.id, action: "import_start", entityType: "ImportJob", entityId: id });
    runJobInBackground(job.id);
    return NextResponse.json({ jobId: job.id });
  }

  return NextResponse.json({ ok: true });
}
