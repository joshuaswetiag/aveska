import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { FitmentOverrideForm } from "@/components/fitment-override-form";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      fitments: { include: { vehicle: true } },
      overrides: true,
      orderItems: { include: { order: { include: { customer: true } } }, take: 50 },
      recommendations: true,
    },
  });
  if (!product) notFound();
  const customerIds = new Set(product.orderItems.map((i) => i.order.customerId));
  return (
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
        <Stat label="Customers who purchased" value={customerIds.size} />
        <Stat label="Related fitments" value={product.fitments.length} />
        <Stat label="Recommendations" value={product.recommendations.length} />
        <Stat label="Eligible customers" value={product.recommendations.filter((r) => r.status === "GENERATED" || r.status === "APPROVED").length} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Vehicle applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {product.fitments.map((f) => (
            <div key={f.id} className="flex justify-between text-sm">
              <Link href={`/vehicles/${f.vehicleId}`} className="hover:underline">
                {f.vehicle.canonicalName}
              </Link>
              <span className="text-muted-foreground">
                {f.isNegative ? "NOT compatible" : f.source} · {Math.round(Number(f.confidence) * 100)}%
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
          {[...customerIds].map((cid) => {
            const item = product.orderItems.find((i) => i.order.customerId === cid);
            return (
              <Link key={cid} href={`/customers/${cid}`} className="block py-1 text-sm hover:underline">
                {item?.order.customer.name}
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string | number; value: string | number }) {
  return (
    <div className="surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
