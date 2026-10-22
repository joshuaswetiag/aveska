import { AnalyseButton, DemoButton } from "@/components/analyse-button";
import { DashboardCharts } from "@/components/dashboard-charts";
import { SyncAllButton } from "@/components/sync-all-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageState, usePageData } from "@/lib/use-page-data";

type DashboardData = {
  stats: Array<{ label: string; value: string | number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  vehicles: Array<{ name: string; customers: number }>;
  potential: number;
};

export default function DashboardPage() {
  const state = usePageData<DashboardData>("/api/views/dashboard", { search: false });
  return (
    <PageState {...state}>
      {(data) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold">Marketing intelligence</h1>
              <p className="mt-1 text-muted-foreground">Vehicle-based cross-sell for Aveska restoration parts.</p>
            </div>
            <div className="flex gap-2">
              <DemoButton />
              <SyncAllButton />
              <AnalyseButton />
            </div>
          </div>
          <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.stats.map((stat) => (
              <Card key={stat.label} className="overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary via-accent to-teal-300" />
                <CardHeader>
                  <CardTitle className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{stat.label}</CardTitle>
                </CardHeader>
                <CardContent className="pt-2 font-display text-2xl font-semibold">{stat.value}</CardContent>
              </Card>
            ))}
          </div>
          <DashboardCharts ordersByMonth={data.ordersByMonth} vehicles={data.vehicles} potential={data.potential} />
        </div>
      )}
    </PageState>
  );
}
