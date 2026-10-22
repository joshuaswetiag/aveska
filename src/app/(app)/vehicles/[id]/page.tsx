import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { StoreProductLink } from "@/components/store-product-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useParams } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency } from "@/lib/utils";

type VehicleDetail = {
  orders: number;
  revenue: number;
  popular: Array<{ name: string; url: string | null }>;
  available: Array<{ id: string; name: string; url: string | null }>;
  vehicle: {
    id: string;
    canonicalName: string;
    make: string | null;
    series: string[];
    bodyType: string | null;
    recommendations: unknown[];
    customerVehicles: Array<{ id: string; customerId: string; customer: { name: string } }>;
  };
};

export default function VehicleDetailPage() {
  const { id } = useParams();
  const state = usePageData<VehicleDetail>(id ? `/api/views/vehicles/${id}` : null, { search: false });
  return (
    <PageState {...state}>
      {({ vehicle, orders, revenue, popular, available }) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold">{vehicle.canonicalName}</h1>
              <p className="text-muted-foreground">
                {vehicle.make} · {vehicle.series.join("/")} · {vehicle.bodyType ?? "Any body"}
              </p>
            </div>
            <GenerateCampaignButton vehicleId={vehicle.id} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Customers" value={vehicle.customerVehicles.length} />
            <Stat label="Orders" value={orders} />
            <Stat label="Revenue" value={formatCurrency(revenue)} />
            <Stat label="Campaign opportunities" value={vehicle.recommendations.length} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Popular purchased</CardTitle>
            </CardHeader>
            <CardContent>
              {popular.map((item) => (
                <StoreProductLink key={`${item.name}:${item.url ?? ""}`} name={item.name} url={item.url} />
              ))}
              {!popular.length ? <p className="text-sm text-muted-foreground">No purchases linked to this vehicle yet.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Products customers may also need</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Only products with explicit vehicle fitment are listed. Names open the live Aveska product page.</p>
              {available.map((item) => (
                <StoreProductLink key={item.id} name={item.name} url={item.url} />
              ))}
              {!available.length ? <p className="text-sm text-muted-foreground">No additional in-catalogue fitments found.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent>
              {vehicle.customerVehicles.map((row) => (
                <Link key={row.id} href={`/customers/${row.customerId}`} className="block py-1 text-sm hover:underline">
                  {row.customer.name}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </PageState>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
