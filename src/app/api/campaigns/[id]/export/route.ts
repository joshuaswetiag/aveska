import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toCsv } from "@/lib/import/parse-file";
import * as XLSX from "xlsx";
import { audit } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      recipients: { include: { customer: true } },
      products: { include: { product: true, recommendation: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = campaign.recipients.map((recipient) => {
    const recProduct = campaign.products[0]?.product;
    return {
      "Customer Name": recipient.customer.name,
      Email: recipient.customer.email ?? "",
      Vehicle: recipient.vehicleLabel ?? "",
      "Purchased Product": recipient.purchasedProduct ?? "",
      "Recommended Product": recProduct?.name ?? "",
      "Product URL": recProduct?.url ?? "",
      Subject: recipient.subject ?? "",
      Preheader: recipient.preheader ?? "",
      "Email Body": recipient.bodyHtml ?? "",
      "Campaign Name": campaign.name,
      "Recommendation Score": campaign.products[0]?.recommendation ? Number(campaign.products[0].recommendation.score) : "",
    };
  });
  const list = campaign.recipients
    .filter((r) => r.customer.email)
    .map((r) => ({ Email: r.customer.email, Name: r.customer.name, Vehicle: r.vehicleLabel }));

  await prisma.campaign.update({ where: { id }, data: { exportedAt: new Date(), status: campaign.status === "APPROVED" ? "EXPORTED" : campaign.status } });
  await audit({ userId: session.user.id, action: "campaign_export", entityType: "Campaign", entityId: id });

  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Campaign");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(list), "Email list");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${campaign.slug}.xlsx"`,
      },
    });
  }
  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${campaign.slug}.csv"`,
    },
  });
}
