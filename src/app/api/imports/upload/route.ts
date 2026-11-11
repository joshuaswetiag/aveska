import path from "path";
import { NextResponse } from "@/server/next-response";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseSpreadsheet } from "@/lib/import/parse-file";
import { detectColumnMapping } from "@/lib/import/columns";
import type { ImportType } from "@prisma/client";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";
import { readEnv } from "@/lib/read-env";

const ALLOWED = [".csv", ".xlsx", ".xls", ".json", ".txt"];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const type = String(form.get("type") ?? "ORDERS") as ImportType;
  if (!["ORDERS", "CATALOGUE", "SUPPRESSION", "VEHICLE_ALIASES"].includes(type)) {
    return NextResponse.json({ error: "Unknown import type" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
  const recent = await prisma.importJob.findFirst({
    where: {
      fileName: file.name,
      status: { in: ["PENDING", "VALIDATING", "MAPPING", "PROCESSING"] },
      createdAt: { gt: new Date(Date.now() - 8_000) },
    },
    select: { id: true },
  });
  if (recent) return NextResponse.json({ error: "That file is already importing" }, { status: 409 });

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json({ error: "Unsupported file type. Use CSV, XLSX, or JSON." }, { status: 400 });
  }
  const maxMb = Number(readEnv("MAX_UPLOAD_MB") ?? 25);
  if (file.size > maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `File exceeds ${maxMb}MB limit` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseSpreadsheet(buffer, file.name);
  } catch {
    return NextResponse.json({ error: "Could not parse the file. Check the format and try again." }, { status: 400 });
  }

  const importJob = await prisma.importJob.create({
    data: {
      type,
      status: "MAPPING",
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      detectedColumns: parsed.headers,
      totalRows: parsed.totalRows,
      createdById: session.user.id,
      columnMapping: detectColumnMapping(parsed.headers, type === "CATALOGUE" ? "catalogue" : "orders") as object,
    },
  });
  const filePath = await saveUpload(`${importJob.id}${ext}`, buffer);
  await prisma.importJob.update({ where: { id: importJob.id }, data: { filePath } });
  await audit({ userId: session.user.id, action: "import_upload", entityType: "ImportJob", entityId: importJob.id });

  return NextResponse.json({
    id: importJob.id,
    headers: parsed.headers,
    preview: parsed.preview,
    totalRows: parsed.totalRows,
    mapping: detectColumnMapping(parsed.headers, type === "CATALOGUE" ? "catalogue" : "orders"),
  });
}
