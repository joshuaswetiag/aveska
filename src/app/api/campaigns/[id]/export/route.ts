import { NextResponse } from "@/server/next-response";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/parse-file";
import { audit } from "@/lib/audit";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const personalized = recipient.personalized as { products?: Array<{ name?: string; url?: string }> } | null;
    const own = personalized?.products?.[0];
    const linked = campaign.products.find((row) => row.recommendation?.customerId === recipient.customerId);
    const recProduct = own ?? (linked?.product ? { name: linked.product.name, url: linked.product.url } : null);
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
      "Recommendation Score": linked?.recommendation ? Number(linked.recommendation.score) : "",
    };
  });
  const list = campaign.recipients
    .filter((r) => r.customer.email)
    .map((r) => ({ Email: r.customer.email, Name: r.customer.name, Vehicle: r.vehicleLabel }));

  await prisma.campaign.update({ where: { id }, data: { exportedAt: new Date() } });
  await audit({ userId: session.user.id, action: "campaign_export", entityType: "Campaign", entityId: id });

  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format === "xlsx") {
    const buffer = await toXlsx([
      { name: "Campaign", rows },
      { name: "Email list", rows: list },
    ]);
    return new NextResponse(new Blob([new Uint8Array(buffer)]), {
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
