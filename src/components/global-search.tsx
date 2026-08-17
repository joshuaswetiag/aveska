"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SearchResult = {
  customers: Array<{ id: string; name: string; email: string | null }>;
  products: Array<{ id: string; name: string; sku: string | null }>;
  vehicles: Array<{ id: string; canonicalName: string }>;
  campaigns: Array<{ id: string; name: string }>;
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      setResults(await res.json());
      setOpen(true);
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div className="relative w-full max-w-xl">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Search customers, SKUs, vehicles, campaigns…"
        className="h-9 w-full rounded-lg border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {open && results && (
        <div className="absolute z-30 mt-3 w-full overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-2 shadow-[0_24px_50px_rgba(22,48,66,0.16)] backdrop-blur-xl">
          <Group title="Customers" items={results.customers.map((c) => ({ href: `/customers/${c.id}`, label: c.name, extra: c.email }))} onPick={() => setOpen(false)} />
          <Group title="Products" items={results.products.map((p) => ({ href: `/products/${p.id}`, label: p.name, extra: p.sku }))} onPick={() => setOpen(false)} />
          <Group title="Vehicles" items={results.vehicles.map((v) => ({ href: `/vehicles/${v.id}`, label: v.canonicalName }))} onPick={() => setOpen(false)} />
          <Group title="Campaigns" items={results.campaigns.map((c) => ({ href: `/campaigns/${c.id}`, label: c.name }))} onPick={() => setOpen(false)} />
          {!results.customers.length && !results.products.length && !results.vehicles.length && !results.campaigns.length && (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  onPick,
}: {
  title: string;
  items: Array<{ href: string; label: string; extra?: string | null }>;
  onPick: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mb-1">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onPick}
          className="block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary"
        >
          {item.label}
          {item.extra ? <span className="ml-2 text-xs text-muted-foreground">{item.extra}</span> : null}
        </Link>
      ))}
    </div>
  );
}
