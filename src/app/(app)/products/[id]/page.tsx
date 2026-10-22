import { FitmentOverrideForm } from "@/components/fitment-override-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useParams } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency } from "@/lib/utils";

type ProductDetail = {
  eligible: number;
  customers: Array<{ id: string; name: string }>;
  product: {
    id: string;
    name: string;
    sku: string;
    category: string | null;
    price: string | number | null;
    url: string | null;
    fitments: Array<{ id: string; vehicleId: string; isNegative: boolean; source: string; confidence: string | number; vehicle: { canonicalName: string } }>;
    recommendations: unknown[];
  };
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const state = usePageData<ProductDetail>(id ? `/api/views/products/${id}` : null, { search: false });
  return (
    <PageState {...state}>
      {({ product, customers, eligible }) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-semibold">{product.name}</h1>
            <p className="text-muted-foreground">
              {product.sku} · {product.category} · {formatCurrency(product.price ? Number(product.price) : null)}
            </p>
            {product.url ? (
              <a href={product.url} className="text-sm text-primary hover:underline" target="_blank">
                Canonical product URL
              </a>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Customers who purchased" value={customers.length} />
            <Stat label="Related fitments" value={product.fitments.length} />
            <Stat label="Recommendations" value={product.recommendations.length} />
            <Stat label="Eligible customers" value={eligible} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Vehicle applications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {product.fitments.map((fitment) => (
                <div key={fitment.id} className="flex justify-between text-sm">
                  <Link href={`/vehicles/${fitment.vehicleId}`} className="hover:underline">
                    {fitment.vehicle.canonicalName}
                  </Link>
                  <span className="text-muted-foreground">
                    {fitment.isNegative ? "NOT compatible" : fitment.source} · {Math.round(Number(fitment.confidence) * 100)}%
                  </span>
                </div>
              ))}
              {!product.fitments.length ? <p className="text-sm text-muted-foreground">Insufficient fitment data</p> : null}
            </CardContent>
          </Card>
          <FitmentOverrideForm productId={product.id} />
          <Card>
            <CardHeader>
              <CardTitle>Customers</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.map((customer) => (
                <Link key={customer.id} href={`/customers/${customer.id}`} className="block py-1 text-sm hover:underline">
                  {customer.name}
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
