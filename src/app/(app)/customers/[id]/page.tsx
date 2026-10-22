import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { RecommendationActions } from "@/components/recommendation-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleMergeForm } from "@/components/vehicle-merge-form";
import { useParams } from "@/lib/router";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";

type CustomerDetail = {
  id: string;
  name: string;
  email: string | null;
  isSuppressed: boolean;
  totalOrders: number;
  totalSpend: string | number;
  averageOrderValue: string | number;
  lastPurchaseAt: string | null;
  segments: Array<{ segmentId: string; segment: { name: string } }>;
  vehicles: Array<{ id: string; vehicleId: string; confidence: string | number; vehicle: { canonicalName: string } }>;
  orders: Array<{ orderDate: string | null; items: Array<{ id: string; productName: string }> }>;
  recommendations: Array<{
    id: string;
    productId: string;
    score: string | number;
    confidence: string | number;
    status: string;
    product: { name: string; url: string | null; price: string | number | null; stockStatus: string };
    vehicle: { canonicalName: string };
    reasons: Array<{ id: string; label: string }>;
  }>;
  campaignRecipients: Array<{ id: string; campaignId: string; campaign: { name: string } }>;
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const state = usePageData<CustomerDetail>(id ? `/api/views/customers/${id}` : null, { search: false });
  return (
    <PageState {...state}>
      {(customer) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold">{customer.name}</h1>
              <p className="text-muted-foreground">{customer.email ?? "No email on file"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {customer.segments.map((row) => (
                  <Badge key={row.segmentId}>{row.segment.name}</Badge>
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
              {customer.vehicles.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <Link href={`/vehicles/${row.vehicleId}`} className="font-medium hover:underline">
                    {row.vehicle.canonicalName}
                  </Link>
                  <span className="text-sm text-muted-foreground">{formatPercent(Number(row.confidence))} confidence</span>
                </div>
              ))}
              {!customer.vehicles.length ? <p className="text-sm text-muted-foreground">No vehicle profile extracted yet.</p> : null}
              <VehicleMergeForm customerId={customer.id} vehicles={customer.vehicles.map((row) => ({ id: row.id, name: row.vehicle.canonicalName }))} />
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
              {!customer.recommendations.length ? <p className="text-sm text-muted-foreground">No recommendations yet. Run Analyse customers.</p> : null}
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
      )}
    </PageState>
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
