"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardCharts({
  ordersByMonth,
  vehicles,
  potential,
}: {
  ordersByMonth: Array<{ month: string; count: number }>;
  vehicles: Array<{ name: string; customers: number }>;
  potential: number;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Orders by month</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ordersByMonth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5e3ea" />
              <XAxis dataKey="month" fontSize={12} tick={{ fill: "#5b7380" }} />
              <YAxis allowDecimals={false} fontSize={12} tick={{ fill: "#5b7380" }} />
              <defs>
                <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" />
                  <stop offset="100%" stopColor="#0f766e" />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #d5e3ea", boxShadow: "0 12px 30px rgba(22,48,66,0.08)" }}
              />
              <Bar dataKey="count" fill="url(#ordersFill)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Customers by vehicle</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vehicles} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d5e3ea" />
              <XAxis type="number" allowDecimals={false} fontSize={12} tick={{ fill: "#5b7380" }} />
              <YAxis type="category" dataKey="name" width={160} fontSize={11} tick={{ fill: "#5b7380" }} />
              <defs>
                <linearGradient id="vehiclesFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0ea5a0" />
                  <stop offset="100%" stopColor="#5eead4" />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid #d5e3ea", boxShadow: "0 12px 30px rgba(22,48,66,0.08)" }}
              />
              <Bar dataKey="customers" fill="url(#vehiclesFill)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Potential cross-sell opportunities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-display text-4xl font-semibold text-primary">{potential.toLocaleString()}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked recommendations with established vehicle compatibility.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
