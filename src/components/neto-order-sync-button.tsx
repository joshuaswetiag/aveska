"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { toast } from "sonner";

const STORE_TIMEZONE = "Australia/Sydney";

function storeIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function daysAgo(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: storeIsoDate(from), to: storeIsoDate(to) };
}

export function NetoOrderSyncForm({ label = "Sync orders" }: { label?: string }) {
  const today = useMemo(() => storeIsoDate(new Date()), []);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  function applyPreset(days: number) {
    const range = daysAgo(days);
    setFrom(range.from);
    setTo(range.to);
  }

  async function sync() {
    if (!from || !to) {
      toast.error("Choose a from and to date");
      return;
    }
    setPending(true);
    const res = await fetch("/api/orders/neto-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Order sync could not start");
      return;
    }
    toast.success(`Syncing Aveska orders ${from} to ${to}`);
    router.push(`/jobs/${data.jobId}`);
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor="sync-from">From</Label>
        <Input id="sync-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sync-to">To</Label>
        <Input id="sync-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-2 md:col-span-2">
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(0)} disabled={pending}>
          Today
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(6)} disabled={pending}>
          7 days
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => applyPreset(29)} disabled={pending}>
          30 days
        </Button>
        <Button type="button" disabled={pending} onClick={() => void sync()}>
          {pending ? "Starting…" : label}
        </Button>
      </div>
    </div>
  );
}

export function NetoOrderSyncButton({ label = "Sync orders" }: { label?: string }) {
  return <NetoOrderSyncForm label={label} />;
}
