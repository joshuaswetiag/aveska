import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseSpreadsheet } from "@/lib/import/parse-file";
import { detectColumnMapping } from "@/lib/import/columns";
import type { ImportType } from "@prisma/client";
import { audit } from "@/lib/audit";

const ALLOWED = [".csv", ".xlsx", ".xls", ".json", ".txt"];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  const type = String(form.get("type") ?? "ORDERS") as ImportType;
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json({ error: "Unsupported file type. Use CSV, XLSX, or JSON." }, { status: 400 });
  }
  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  if (file.size > maxMb * 1024 * 1024) {
    return NextResponse.json({ error: `File exceeds ${maxMb}MB limit` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseSpreadsheet(buffer, file.name);
  } catch {
    return NextResponse.json({ error: "Could not parse the file. Check the format and try again." }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
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
  const filePath = path.join(uploadDir, `${importJob.id}${ext}`);
  await writeFile(filePath, buffer);
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
