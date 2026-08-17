import { prisma } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard-charts";
import { AnalyseButton, DemoButton } from "@/components/analyse-button";
import { SyncAllButton } from "@/components/sync-all-button";

export default async function DashboardPage() {
  const [
    customers,
    orders,
    products,
    vehicles,
    recs,
    campaigns,
    approved,
    revenue,
    eligible,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count(),
    prisma.product.count(),
    prisma.vehicle.count(),
    prisma.recommendation.count(),
    prisma.campaign.count(),
    prisma.campaign.count({ where: { status: "APPROVED" } }),
    prisma.order.aggregate({ _sum: { orderTotal: true } }),
    prisma.customer.count({
      where: { isSuppressed: false, recommendations: { some: { status: { in: ["GENERATED", "APPROVED"] } } } },
    }),
  ]);

  const monthly = await prisma.order.findMany({
    where: { orderDate: { not: null } },
    select: { orderDate: true, orderTotal: true },
  });
  const byMonth: Record<string, number> = {};
  for (const order of monthly) {
    if (!order.orderDate) continue;
    const key = `${order.orderDate.getFullYear()}-${String(order.orderDate.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] ?? 0) + 1;
  }

  const vehicleGroups = await prisma.vehicle.findMany({
    include: { _count: { select: { customerVehicles: true } } },
    orderBy: { customerVehicles: { _count: "desc" } },
    take: 8,
  });

  const potential = await prisma.recommendation.aggregate({
    where: { status: { in: ["GENERATED", "APPROVED"] } },
    _count: true,
  });

  const stats = [
    { label: "Customers", value: customers },
    { label: "Orders", value: orders },
    { label: "Revenue", value: formatCurrency(Number(revenue._sum.orderTotal ?? 0)) },
    { label: "Unique vehicles", value: vehicles },
    { label: "Catalogue products", value: products },
    { label: "Eligible for cross-sell", value: eligible },
    { label: "Recommendations", value: recs },
    { label: "Campaigns / approved", value: `${campaigns} / ${approved}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Marketing intelligence</h1>
          <p className="mt-1 text-muted-foreground">
            Vehicle-based cross-sell for Aveska restoration parts.
          </p>
        </div>
        <div className="flex gap-2">
          <DemoButton />
          <SyncAllButton />
          <AnalyseButton />
        </div>
      </div>
      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary via-accent to-teal-300" />
            <CardHeader>
              <CardTitle className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 font-display text-2xl font-semibold">{stat.value}</CardContent>
          </Card>
        ))}
      </div>
      <DashboardCharts
        ordersByMonth={Object.entries(byMonth).map(([month, count]) => ({ month, count }))}
        vehicles={vehicleGroups.map((v) => ({ name: v.canonicalName, customers: v._count.customerVehicles }))}
        potential={potential._count}
      />
    </div>
  );
}
