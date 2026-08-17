import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { RecommendationActions } from "@/components/recommendation-actions";
import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { VehicleMergeForm } from "@/components/vehicle-merge-form";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      vehicles: { include: { vehicle: true } },
      orders: { include: { items: true }, orderBy: { orderDate: "desc" } },
      recommendations: { include: { product: true, vehicle: true, reasons: true }, orderBy: { score: "desc" } },
      segments: { include: { segment: true } },
      campaignRecipients: { include: { campaign: true } },
    },
  });
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">{customer.name}</h1>
          <p className="text-muted-foreground">{customer.email ?? "No email on file"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {customer.segments.map((s) => (
              <Badge key={s.segmentId}>{s.segment.name}</Badge>
            ))}
            {customer.isSuppressed ? <Badge variant="warning">Do not contact</Badge> : null}
          </div>
        </div>
        <GenerateCampaignButton customerId={customer.id} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Orders" value={customer.totalOrders} />
        <Stat label="Spend" value={formatCurrency(Number(customer.totalSpend))} />
        <Stat label="AOV" value={formatCurrency(Number(customer.averageOrderValue))} />
        <Stat label="Last purchase" value={formatDate(customer.lastPurchaseAt)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Vehicles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {customer.vehicles.map((cv) => (
            <div key={cv.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <Link href={`/vehicles/${cv.vehicleId}`} className="font-medium hover:underline">
                {cv.vehicle.canonicalName}
              </Link>
              <span className="text-sm text-muted-foreground">{formatPercent(Number(cv.confidence))} confidence</span>
            </div>
          ))}
          {!customer.vehicles.length ? <p className="text-sm text-muted-foreground">No vehicle profile extracted yet.</p> : null}
          <VehicleMergeForm
            customerId={customer.id}
            vehicles={customer.vehicles.map((cv) => ({ id: cv.id, name: cv.vehicle.canonicalName }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Purchase timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customer.orders.flatMap((order) =>
            order.items.map((item) => (
              <div key={item.id} className="border-l-2 border-primary/40 pl-3">
                <div className="text-xs text-muted-foreground">{formatDate(order.orderDate)}</div>
                <div className="font-medium">{item.productName}</div>
              </div>
            )),
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recommended products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {customer.recommendations.map((rec) => (
            <div key={rec.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/products/${rec.productId}`} className="font-semibold hover:underline">
                    {rec.product.name}
                  </Link>
                  <div className="text-sm text-muted-foreground">
                    {rec.vehicle.canonicalName} · Score {Number(rec.score)} · {formatPercent(Number(rec.confidence))}
                  </div>
                </div>
                <Badge>{rec.status.replaceAll("_", " ")}</Badge>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {rec.reasons.map((reason) => (
                  <li key={reason.id}>✓ {reason.label}</li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                {rec.product.url ? (
                  <a href={rec.product.url} className="text-primary hover:underline" target="_blank">
                    Product URL
                  </a>
                ) : null}
                <span>{formatCurrency(rec.product.price ? Number(rec.product.price) : null)}</span>
                <span>{rec.product.stockStatus.replaceAll("_", " ")}</span>
              </div>
              <RecommendationActions id={rec.id} />
            </div>
          ))}
          {!customer.recommendations.length ? (
            <p className="text-sm text-muted-foreground">No recommendations yet. Run Analyse customers.</p>
          ) : null}
        </CardContent>
      </Card>
      {customer.campaignRecipients.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Campaign history</CardTitle>
          </CardHeader>
          <CardContent>
            {customer.campaignRecipients.map((row) => (
              <Link key={row.id} href={`/campaigns/${row.campaignId}`} className="block py-1 hover:underline">
                {row.campaign.name}
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
