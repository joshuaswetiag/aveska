import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { StoreProductLink } from "@/components/store-product-link";
import { formatCurrency } from "@/lib/utils";

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      aliases: true,
      customerVehicles: { include: { customer: true } },
      fitments: { include: { product: { select: { id: true, name: true, url: true } } } },
      recommendations: true,
    },
  });
  if (!vehicle) notFound();
  const customerIds = vehicle.customerVehicles.map((row) => row.customerId);
  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } },
    select: {
      orderTotal: true,
      items: {
        select: {
          productName: true,
          productId: true,
          product: { select: { url: true } },
        },
      },
    },
  });
  const revenue = orders.reduce((sum, order) => sum + Number(order.orderTotal ?? 0), 0);
  const purchased = new Map<string, { name: string; url: string | null; count: number }>();
  const purchasedIds = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId) purchasedIds.add(item.productId);
      const key = item.productId ?? item.productName;
      const current = purchased.get(key);
      if (current) {
        current.count += 1;
        if (!current.url && item.product?.url) current.url = item.product.url;
      } else {
        purchased.set(key, { name: item.productName, url: item.product?.url ?? null, count: 1 });
      }
    }
  }
  const popular = [...purchased.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const available = vehicle.fitments.filter((fitment) => !purchasedIds.has(fitment.productId) && !fitment.isNegative);

  return (
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
        <Stat label="Orders" value={orders.length} />
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
          {available.map((fitment) => (
            <StoreProductLink key={fitment.id} name={fitment.product.name} url={fitment.product.url} />
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
