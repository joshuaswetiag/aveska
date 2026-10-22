import { NetoOrderSyncForm } from "@/components/neto-order-sync-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency, formatDate, STORE_TIMEZONE } from "@/lib/utils";

const PAGE_SIZE = 50;

type OrderFilters = { from?: string; to?: string; q?: string; page: number };
type OrderRow = {
  id: string;
  orderDate: string | null;
  externalId: string;
  status: string;
  customerId: string;
  customerName: string;
  email: string | null;
  productId: string | null;
  productName: string;
  sku: string | null;
  vehicle: string;
  quantity: number;
  unitPrice: string | number | null;
  lineTotal: string | number | null;
  shipping: number | null;
  orderTotal: string | number | null;
};
type OrderReport = {
  filters: OrderFilters;
  items: OrderRow[];
  totalLines: number;
  orderCount: number;
  quantity: number;
  revenue: number;
  orderRevenue: number;
};

function storeIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function presetRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({ from: storeIsoDate(from), to: storeIsoDate(to) });
  return query.toString();
}

function pageHref(filters: OrderFilters, page: number) {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.q) query.set("q", filters.q);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/orders?${qs}` : "/orders";
}

export default function OrdersPage() {
  const state = usePageData<OrderReport>("/api/views/orders");
  return (
    <PageState {...state}>
      {({ filters, items, totalLines, orderCount, quantity, revenue, orderRevenue }) => {
        const pageCount = Math.max(1, Math.ceil(totalLines / PAGE_SIZE));
        const fromRow = totalLines === 0 ? 0 : (filters.page - 1) * PAGE_SIZE + 1;
        const toRow = Math.min(filters.page * PAGE_SIZE, totalLines);
        const exportHref = (format: "csv" | "xlsx") => {
          const query = new URLSearchParams();
          if (filters.from) query.set("from", filters.from);
          if (filters.to) query.set("to", filters.to);
          if (filters.q) query.set("q", filters.q);
          query.set("format", format);
          return `/api/orders/report?${query.toString()}`;
        };
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl font-semibold">Order report</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Live Aveska Neto orders in Australia/Sydney time. Product lines are listed separately from postage; order total matches the store (product plus shipping).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref("csv")}>Export CSV</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref("xlsx")}>Export Excel</a>
                </Button>
              </div>
            </div>
            <div className="surface space-y-3 p-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Sync from Aveska</h2>
                <p className="text-sm text-muted-foreground">
                  Choose today, the last month, or any date range. The app pulls orders placed in that window and orders updated on the website in that window, so store edits are not missed.
                </p>
              </div>
              <NetoOrderSyncForm />
            </div>
            <form className="surface grid gap-3 p-5 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" name="from" defaultValue={filters.from} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" name="to" defaultValue={filters.to} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="q">Search</Label>
                <Input id="q" name="q" defaultValue={filters.q} placeholder="Customer, email, product, SKU, order #" />
              </div>
              <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                <Button type="submit" size="sm">
                  Apply
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/orders">Clear</Link>
                </Button>
                <Link href={`/orders?${presetRange(1)}`} className="chip">
                  Today
                </Link>
                <Link href={`/orders?${presetRange(30)}`} className="chip">
                  Last 30 days
                </Link>
                <Link href={`/orders?${presetRange(90)}`} className="chip">
                  Last 90 days
                </Link>
              </div>
            </form>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Card>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Orders</div>
                  <div className="mt-1 font-display text-2xl">{orderCount.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Line items</div>
                  <div className="mt-1 font-display text-2xl">{totalLines.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Quantity</div>
                  <div className="mt-1 font-display text-2xl">{quantity.toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Product revenue</div>
                  <div className="mt-1 font-display text-2xl">{formatCurrency(revenue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Order total</div>
                  <div className="mt-1 font-display text-2xl">{formatCurrency(orderRevenue)}</div>
                </CardContent>
              </Card>
            </div>
            <div className="surface overflow-x-auto">
              <table className="w-full min-w-[1240px] text-sm">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">Date</th>
                    <th>Order #</th>
                    <th>Status</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Product</th>
                    <th>Vehicle</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Unit price</th>
                    <th className="text-right">Line total</th>
                    <th className="text-right">Shipping</th>
                    <th className="text-right">Order total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-border align-top">
                      <td className="whitespace-nowrap p-3">{formatDate(item.orderDate)}</td>
                      <td className="whitespace-nowrap">{item.externalId}</td>
                      <td>{item.status}</td>
                      <td>
                        <Link href={`/customers/${item.customerId}`} className="font-medium hover:underline">
                          {item.customerName}
                        </Link>
                      </td>
                      <td className="text-muted-foreground">{item.email ?? "—"}</td>
                      <td className="max-w-xs">
                        {item.productId ? (
                          <Link href={`/products/${item.productId}`} className="hover:underline">
                            {item.productName}
                          </Link>
                        ) : (
                          item.productName
                        )}
                        {item.sku ? <div className="text-xs text-muted-foreground">{item.sku}</div> : null}
                      </td>
                      <td className="max-w-xs">{item.vehicle}</td>
                      <td className="text-right">{item.quantity}</td>
                      <td className="text-right">{formatCurrency(item.unitPrice != null ? Number(item.unitPrice) : null)}</td>
                      <td className="text-right">{formatCurrency(item.lineTotal != null ? Number(item.lineTotal) : null)}</td>
                      <td className="text-right">{formatCurrency(item.shipping)}</td>
                      <td className="text-right">{formatCurrency(item.orderTotal != null ? Number(item.orderTotal) : null)}</td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr>
                      <td colSpan={12} className="p-6 text-sm text-muted-foreground">
                        {totalLines === 0 && !filters.q && !filters.from && !filters.to ? (
                          <>
                            No live Neto orders in this database yet. Use <strong>Sync from Aveska</strong> above with today or a date range to pull real orders from the store.
                          </>
                        ) : (
                          "No order lines match this date range or search."
                        )}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Showing {fromRow.toLocaleString()}–{toRow.toLocaleString()} of {totalLines.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                {filters.page > 1 ? (
                  <Link href={pageHref(filters, filters.page - 1)} className="pager">
                    Previous
                  </Link>
                ) : (
                  <span className="pager opacity-50">Previous</span>
                )}
                <span className="text-muted-foreground">
                  Page {filters.page} of {pageCount}
                </span>
                {filters.page < pageCount ? (
                  <Link href={pageHref(filters, filters.page + 1)} className="pager">
                    Next
                  </Link>
                ) : (
                  <span className="pager opacity-50">Next</span>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </PageState>
  );
}
