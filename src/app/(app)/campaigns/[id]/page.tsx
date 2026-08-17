import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CampaignActions } from "@/components/campaign-actions";
import { CampaignRecipientList } from "@/components/campaign-recipient-list";
import { formatDate, formatDateTime, zonedDayRange } from "@/lib/utils";
import { listCampaignTraffic } from "@/lib/email/tracking-record";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      recipients: { include: { customer: true }, take: 200, orderBy: { createdAt: "asc" } },
      products: { include: { product: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!campaign) notFound();
  const traffic = await listCampaignTraffic({ campaignId: id, take: 50 });
  const orderRange = campaign.vehicleFilter?.startsWith("orders:")
    ? campaign.vehicleFilter.replace("orders:", "").split(":")
    : null;
  const dateRange = orderRange?.length === 2 ? `${orderRange[0]} to ${orderRange[1]}` : null;
  const ordersInRange =
    orderRange?.length === 2
      ? await prisma.order.count({
          where: {
            orderDate: { gte: zonedDayRange(orderRange[0]).start, lt: zonedDayRange(orderRange[1]).end },
            externalId: { not: null },
            NOT: { externalId: { startsWith: "DEMO" } },
          },
        })
      : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{campaign.name}</h1>
          <p className="text-muted-foreground">
            {campaign.type.replaceAll("_", " ")} · <Badge>{campaign.status}</Badge> ·{" "}
            {campaign._count.recipients.toLocaleString()} personalized promotions
            {dateRange ? ` · Orders ${dateRange}` : ""}
            {ordersInRange != null
              ? ` · ${ordersInRange.toLocaleString()} orders in range`
              : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Generated {formatDate(campaign.createdAt)}</p>
          {ordersInRange != null && ordersInRange > campaign._count.recipients ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {campaign._count.recipients.toLocaleString()} promotions from {ordersInRange.toLocaleString()} orders.
              Extra orders were the same customer, had no extracted vehicle, or had no matching in-stock parts.
            </p>
          ) : null}
        </div>
        <CampaignActions id={campaign.id} status={campaign.status} />
      </div>
      {campaign.recipients.length ? (
        <CampaignRecipientList
          campaignSubject={campaign.subject ?? ""}
          campaignPreheader={campaign.preheader ?? ""}
          campaignHtml={campaign.bodyHtml ?? ""}
          recipients={campaign.recipients.map((row) => ({
            id: row.id,
            customerName: row.customer.name,
            email: row.customer.email,
            vehicleLabel: row.vehicleLabel,
            purchasedProduct: row.purchasedProduct,
            subject: row.subject,
            preheader: row.preheader,
            bodyHtml: row.bodyHtml,
            createdAt: row.createdAt.toISOString(),
            sent: row.sent,
            sendError: row.sendError,
            opened: row.opened,
            clicked: row.clicked,
          }))}
        />
      ) : (
        <p className="text-muted-foreground">
          No eligible promotions. Customers in this date range may have no extracted vehicle, no matching in-stock
          parts, or they are suppressed / missing email.
        </p>
      )}
      {campaign._count.recipients > campaign.recipients.length ? (
        <p className="text-sm text-muted-foreground">
          Showing {campaign.recipients.length.toLocaleString()} of {campaign._count.recipients.toLocaleString()}{" "}
          promotions. Export the campaign to download the full list.
        </p>
      ) : null}

      <div className="surface overflow-x-auto">
        <div className="flex items-center justify-between p-3">
          <h2 className="font-display text-lg font-semibold">Traffic</h2>
          <Link href="/traffic" className="text-sm text-primary hover:underline">
            View all traffic
          </Link>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">Date</th>
              <th>Name</th>
              <th>Traffic</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {traffic.map((event) => (
              <tr key={event.id} className="border-t border-border">
                <td className="whitespace-nowrap p-3">{formatDateTime(event.createdAt)}</td>
                <td>
                  <Link href={`/customers/${event.customerId}`} className="font-medium hover:underline">
                    {event.customerName}
                  </Link>
                </td>
                <td>
                  <Badge variant={event.type === "CLICK" ? "success" : "muted"}>
                    {event.type === "CLICK" ? "Clicked" : "Opened"}
                  </Badge>
                  {event.label ? <span className="ml-2 text-muted-foreground">{event.label}</span> : null}
                </td>
                <td className="max-w-xs truncate text-muted-foreground">{event.url ?? "—"}</td>
              </tr>
            ))}
            {!traffic.length ? (
              <tr>
                <td colSpan={4} className="p-6 text-sm text-muted-foreground">
                  No clicks yet. After you send this campaign, customer link clicks appear here with date and name.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
