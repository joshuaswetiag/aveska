"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Car,
  LayoutDashboard,
  Users,
  ShoppingBag,
  Package,
  Sparkles,
  Target,
  Mail,
  MousePointerClick,
  Upload,
  ShieldAlert,
  Settings,
  Search,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/global-search";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/orders", label: "Order report", icon: ShoppingBag },
  { href: "/products", label: "Products", icon: Package },
  { href: "/vehicles", label: "Vehicles", icon: Car },
  { href: "/recommendations", label: "Recommendations", icon: Sparkles },
  { href: "/opportunities", label: "Cross-Sell Opportunities", icon: Target },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/traffic", label: "Traffic", icon: MousePointerClick },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/data-quality", label: "Data Quality", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] backdrop-blur">
        <span className="h-3.5 w-3.5 rotate-45 rounded-sm bg-gradient-to-br from-teal-200 to-accent" />
      </span>
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-sidebar-muted">Aveska</div>
        <div className="font-display text-lg font-semibold leading-tight">Intelligence</div>
      </div>
    </div>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="relative flex-1 space-y-1 px-3 pb-6">
      {NAV.map((item, index) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            style={{ animationDelay: `${index * 35}ms` }}
            className={cn(
              "group relative flex items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-sm text-sidebar-muted transition-all duration-200 hover:translate-x-0.5 hover:bg-white/10 hover:text-white",
              active && "bg-white/12 text-white shadow-[inset_3px_0_0_#5eead4]",
            )}
          >
            <item.icon className={cn("h-4 w-4 transition-transform duration-200 group-hover:scale-110", active && "text-teal-200")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  user,
  signOutSlot,
}: {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null; role?: string };
  signOutSlot: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-72 shrink-0 overflow-hidden bg-gradient-to-b from-[#0f5b66] via-sidebar to-[#0b3d46] text-sidebar-foreground md:flex md:flex-col">
        <div className="pointer-events-none absolute -left-16 top-24 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-24 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative px-5 py-7">
          <Brand />
        </div>
        <NavLinks pathname={pathname} />
        <div className="relative border-t border-white/10 p-4 text-xs text-sidebar-muted">
          <div className="text-sm text-sidebar-foreground">{user.name}</div>
          <div className="mt-0.5 uppercase tracking-wide">{user.role}</div>
          <div className="mt-3">{signOutSlot}</div>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-[#0b3d46]/45 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
          <aside className="relative flex h-full w-72 flex-col overflow-hidden bg-gradient-to-b from-[#0f5b66] via-sidebar to-[#0b3d46] text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between px-5 py-6">
              <Brand />
              <button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-white/10 p-4 text-xs text-sidebar-muted">
              <div className="text-sm text-sidebar-foreground">{user.name}</div>
              <div className="mt-3">{signOutSlot}</div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/70 bg-card/75 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            className="rounded-lg p-2 text-primary transition-colors hover:bg-primary/10 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-border/80 bg-white/70 px-3 py-1 shadow-[0_8px_24px_rgba(22,48,66,0.05)]">
            <Search className="h-4 w-4 shrink-0 text-primary/70" />
            <GlobalSearch />
          </div>
        </header>
        <main className="page-enter flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
