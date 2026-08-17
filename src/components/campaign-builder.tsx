"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const STORE_TIMEZONE = "Australia/Sydney";

const TYPES = [
  "CROSS_SELL",
  "VEHICLE_RESTORATION",
  "RELATED_PRODUCTS",
  "RE_ENGAGEMENT",
  "NEW_PRODUCT",
  "CATEGORY_PROMOTION",
  "SEASONAL",
  "CLEARANCE",
  "BACK_IN_STOCK",
  "NEWSLETTER",
] as const;

function storeIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function defaultRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: storeIsoDate(from), to: storeIsoDate(to) };
}

export function CampaignBuilder({
  segments,
  vehicles,
}: {
  segments: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string }>;
}) {
  const month = defaultRange(30);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create campaign from orders</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const from = String(form.get("from") ?? "");
            const to = String(form.get("to") ?? "");
            if (!from || !to) {
              toast.error("Select an order date range");
              return;
            }
            setPending(true);
            const res = await fetch("/api/campaigns/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.get("name"),
                type: form.get("type"),
                from,
                to,
                segmentId: form.get("segmentId") || undefined,
                vehicleId: form.get("vehicleId") || undefined,
              }),
            });
            const data = await res.json();
            setPending(false);
            if (!res.ok) {
              toast.error(data.error ?? "Could not create campaign");
              return;
            }
            toast.success("Syncing those dates from Aveska, then generating promotions…");
            router.push(data.jobId ? `/jobs/${data.jobId}` : `/campaigns/${data.campaignId}`);
          }}
        >
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="name">Campaign name</Label>
            <Input id="name" name="name" placeholder="August restoration cross-sell" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from">Orders from</Label>
            <Input id="from" name="from" type="date" defaultValue={month.from} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Orders to</Label>
            <Input id="to" name="to" type="date" defaultValue={month.to} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="type">Campaign type</Label>
            <select id="type" name="type">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="segmentId">Optional segment</Label>
            <select id="segmentId" name="segmentId">
              <option value="">All customers in this date range</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="vehicleId">Optional vehicle filter</Label>
            <select id="vehicleId" name="vehicleId">
              <option value="">Any vehicle from those orders</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending} className="md:col-span-2">
            {pending ? "Starting…" : "Generate promotions for review"}
          </Button>
          <p className="text-xs text-muted-foreground md:col-span-2">
            Uses the selected dates: syncs those orders from the Aveska website first, then writes one promo email
            per customer. Approve, send a test, then bulk-send from the campaign page.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
