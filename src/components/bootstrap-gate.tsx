"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type BootstrapStatus = {
  ready: boolean;
  netoConfigured: boolean;
  needsSync: boolean;
  enqueueError?: string | null;
  workerStarted?: boolean;
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

const EMPTY_COUNTS = {
  customers: 0,
  orders: 0,
  products: 0,
  vehicles: 0,
  recommendations: 0,
  revenue: 0,
};

const EMPTY_STATUS: BootstrapStatus = {
  ready: false,
  netoConfigured: true,
  needsSync: true,
  job: null,
  counts: EMPTY_COUNTS,
};

const STEPS = [
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders & customers" },
  { key: "vehicles", label: "Vehicles" },
  { key: "recommendations", label: "Recommendations" },
];

function stepState(progress: number, index: number, running: boolean) {
  const starts = [0, 36, 77, 91];
  const start = starts[index];
  const next = starts[index + 1] ?? 101;
  if (progress >= next) return "done";
  if (progress >= start && (running || progress > start)) return "active";
  return "pending";
}

export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const started = useRef(false);
  const processing = useRef(false);
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  async function readJson(res: Response) {
    const text = await res.text();
    if (!text.trim()) return {} as BootstrapStatus & { error?: string };
    try {
      return JSON.parse(text) as BootstrapStatus & { error?: string };
    } catch {
      throw new Error("The app returned an invalid response. Redeploy Railway and try again.");
    }
  }

  async function load(startIfNeeded = false) {
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      let data = await readJson(res);
      if (!res.ok) {
        setStatus((current) => current ?? { ...EMPTY_STATUS, netoConfigured: data.netoConfigured ?? false, needsSync: true, ready: false, job: null });
        setError(data.error ?? "Could not check Aveska sync");
        setChecking(false);
        return data;
      }
      if (startIfNeeded && data.netoConfigured && data.needsSync) {
        const posted = await fetch("/api/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          cache: "no-store",
        }).catch(() => undefined);
        if (posted && !posted.ok) {
          const postedBody = await readJson(posted).catch(() => ({ error: "Could not start sync" }));
          setError(postedBody.error ?? "Could not start sync");
        } else {
          const again = await fetch("/api/bootstrap", { cache: "no-store" });
          if (again.ok) data = await readJson(again);
        }
      }
      setStatus(data);
      setError(data.enqueueError ?? "");
      setChecking(false);
      const jobId = data.job?.id;
      if (jobId && (data.job?.status === "QUEUED" || data.job?.status === "RUNNING") && !processing.current) {
        processing.current = true;
        void fetch(`/api/jobs/${jobId}/process`, { method: "POST", cache: "no-store" })
          .catch(() => undefined)
          .finally(() => {
            processing.current = false;
          });
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
  const running = status?.job?.status === "RUNNING";
  const queued = status?.job?.status === "QUEUED";
  const failed = status?.job?.status === "FAILED";
  const barWidth = running ? Math.max(progress, 4) : progress;
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
        {status && !status.netoConfigured ? (
          <p className="mt-4 text-sm text-danger">
            This running app does not have NETO_API_KEY yet. After adding it on the aveska service, click Redeploy, then refresh.
          </p>
        ) : null}
        {status?.enqueueError ? <p className="mt-4 text-sm text-danger">{status.enqueueError}</p> : null}
        {status?.job?.message ? <p className="mt-4 text-sm text-foreground">{status.job.message}</p> : null}
        {!status?.job && status && status.netoConfigured ? (
          <p className="mt-4 text-sm text-foreground">The sync job has not started yet.</p>
        ) : null}
        {queued ? (
          <p className="mt-2 text-sm text-foreground">Waiting for the background worker to start this sync…</p>
        ) : null}
        {status?.job?.status ? (
          <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">Job {status.job.status}</p>
        ) : null}
        {checking && !status ? <p className="mt-4 text-sm text-foreground">Starting full Aveska sync…</p> : null}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${barWidth}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{progress}% complete</p>
        <ol className="mt-5 space-y-2 text-sm">
          {STEPS.map((step, index) => {
            const state = stepState(progress, index, running);
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
        {failed || error || !status?.job ? (
          <div className="mt-5 space-y-3">
            {error || status?.job?.errorMessage ? (
              <p className="text-sm text-danger">{error || status?.job?.errorMessage}</p>
            ) : null}
            <Button
              onClick={async () => {
                started.current = false;
                processing.current = false;
                const res = await fetch("/api/bootstrap", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ force: true }),
                  cache: "no-store",
                });
                const data = await readJson(res);
                if (!res.ok) setError(data.error ?? "Could not restart sync");
                else void load(true);
              }}
            >
              Start sync
            </Button>
          </div>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">This can take several minutes for the full Aveska catalogue and order history.</p>
        )}
      </div>
    </div>
  );
}
