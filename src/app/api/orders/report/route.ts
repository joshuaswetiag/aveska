import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/import/parse-file";
import { fetchOrderReportExport, parseOrderReportFilters } from "@/lib/orders/report";
import * as XLSX from "xlsx";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const filters = parseOrderReportFilters({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = await fetchOrderReportExport(filters);
  const stamp = new Date().toISOString().slice(0, 10);

  await audit({
    userId: session.user.id,
    action: "order_report_export",
    entityType: "Order",
    metadata: { format, from: filters.from, to: filters.to, q: filters.q, rows: rows.length },
  });

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Order report");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="aveska-order-report-${stamp}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="aveska-order-report-${stamp}.csv"`,
    },
  });
}
