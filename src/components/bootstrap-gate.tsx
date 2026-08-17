"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type BootstrapStatus = {
  ready: boolean;
  netoConfigured: boolean;
  needsSync: boolean;
  from?: string;
  to?: string;
  job: {
    id: string;
    status: string;
    progress: number;
    total: number;
    message: string | null;
    errorMessage: string | null;
  } | null;
  counts: {
    customers: number;
    orders: number;
    products: number;
    vehicles: number;
    recommendations: number;
    revenue: number;
  };
};

const STEPS = [
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders & customers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "recommendations", label: "Recommendations" },
];

function stepState(progress: number, index: number) {
  const start = index * 25;
  if (progress >= start + 25) return "done";
  if (progress >= start) return "active";
  return "pending";
}

export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  async function load(startIfNeeded = false) {
    try {
      const res = await fetch("/api/bootstrap");
      const data = (await res.json()) as BootstrapStatus & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not check Aveska sync");
        setChecking(false);
        return data;
      }
      setStatus(data);
      setError("");
      setChecking(false);
      if (startIfNeeded && data.netoConfigured && data.needsSync) {
        await fetch("/api/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch(() => undefined);
        if (data.job?.id) {
          await fetch(`/api/jobs/${data.job.id}/process`, { method: "POST" }).catch(() => undefined);
        }
      }
      return data;
    } catch (err) {
      setChecking(false);
      setError(err instanceof Error ? err.message : "Could not reach the sync API");
      return null;
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void load(true);
  }, []);

  useEffect(() => {
    if (!status || status.ready) return;
    if (status.job?.status === "COMPLETED" && status.needsSync) return;
    const timer = setInterval(() => {
      void load(false).then((data) => {
        if (data?.ready) router.refresh();
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [status?.ready, status?.job?.id, status?.job?.status, router]);

  if (status?.ready) return <>{children}</>;

  const progress = status?.job?.total ? Math.round((status.job.progress / status.job.total) * 100) : 0;
  const failed = status?.job?.status === "FAILED";
  const counts = status?.counts ?? {
    customers: 0,
    orders: 0,
    products: 0,
    vehicles: 0,
    recommendations: 0,
    revenue: 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f3d46] px-4">
      <div className="ui-orb left-[10%] top-[18%] h-64 w-64 bg-teal-300/25" />
      <div className="ui-orb right-[12%] bottom-[14%] h-72 w-72 bg-cyan-400/20" />
      <div className="relative w-full max-w-lg rounded-3xl border border-white/20 bg-white/95 p-8 shadow-[0_30px_80px_rgba(8,47,53,0.35)]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-primary">Aveska</div>
        <h1 className="mt-1 font-display text-2xl font-semibold">Loading your store</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please wait while we sync products, customers, orders, revenue, and vehicles from aveska.com.au.
          The dashboard opens when this finishes.
        </p>
        {!status?.netoConfigured && !checking ? (
          <p className="mt-4 text-sm text-danger">
            NETO_API_KEY is missing on this host. Add it to Railway Variables, redeploy, then refresh.
          </p>
        ) : null}
        {status?.job?.message ? <p className="mt-4 text-sm text-foreground">{status.job.message}</p> : null}
        {checking && !status ? <p className="mt-4 text-sm text-foreground">Starting full Aveska sync…</p> : null}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.max(progress, 4)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{progress}% complete</p>
        <ol className="mt-5 space-y-2 text-sm">
          {STEPS.map((step, index) => {
            const state = stepState(progress, index);
            return (
              <li key={step.key} className="flex items-center justify-between">
                <span className={state === "pending" ? "text-muted-foreground" : "text-foreground"}>{step.label}</span>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {state === "done" ? "Done" : state === "active" ? "Working" : "Waiting"}
                </span>
              </li>
            );
          })}
        </ol>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Products</dt>
            <dd className="font-display text-lg">{counts.products.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Orders</dt>
            <dd className="font-display text-lg">{counts.orders.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Customers</dt>
            <dd className="font-display text-lg">{counts.customers.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Vehicles</dt>
            <dd className="font-display text-lg">{counts.vehicles.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Revenue</dt>
            <dd className="font-display text-lg">{formatCurrency(counts.revenue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Recommendations</dt>
            <dd className="font-display text-lg">{counts.recommendations.toLocaleString()}</dd>
          </div>
        </dl>
        {failed || error ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-danger">{error || status?.job?.errorMessage || "Sync failed"}</p>
            <Button
              onClick={async () => {
                started.current = false;
                const res = await fetch("/api/bootstrap", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ force: true }),
                });
                const data = await res.json();
                if (!res.ok) setError(data.error ?? "Could not restart sync");
                else void load(true);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">This can take several minutes for the full Aveska catalogue and order history.</p>
        )}
      </div>
    </div>
  );
}
