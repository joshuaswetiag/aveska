import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/import/parse-file";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const aliases = await prisma.vehicleAlias.findMany({ include: { vehicle: true } });
  const csv = toCsv(
    aliases.map((a) => ({
      canonical: a.vehicle.canonicalName,
      make: a.vehicle.make,
      series: a.vehicle.series.join("/"),
      alias: a.alias,
    })),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=vehicle-aliases.csv",
    },
  });
}
