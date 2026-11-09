import { NextResponse } from "@/server/next-response";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { toCsv, toXlsx } from "@/lib/import/parse-file";
import { fetchOrderReportExport, parseOrderReportFilters } from "@/lib/orders/report";

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
    const buffer = await toXlsx([{ name: "Order report", rows }]);
    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
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
