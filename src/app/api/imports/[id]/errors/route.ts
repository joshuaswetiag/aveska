import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/import/parse-file";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const errors = await prisma.importRowError.findMany({ where: { importJobId: id } });
  const csv = toCsv(
    errors.map((row) => ({
      rowNumber: row.rowNumber,
      field: row.field ?? "",
      message: row.message,
      raw: JSON.stringify(row.rawData ?? {}),
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
    },
  });
}
