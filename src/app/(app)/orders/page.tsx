import Link from "next/link";
import { formatCurrency, formatDate, STORE_TIMEZONE } from "@/lib/utils";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NetoOrderSyncForm } from "@/components/neto-order-sync-button";
import {
  ORDER_REPORT_PAGE_SIZE,
  fetchOrderReportPage,
  orderReportQueryString,
  orderShippingAmount,
  orderStatusLabel,
  parseOrderReportFilters,
  vehicleLabelForOrderItem,
} from "@/lib/orders/report";

function storeIsoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function presetRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return orderReportQueryString({ from: storeIsoDate(from), to: storeIsoDate(to) });
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filters = parseOrderReportFilters(params);
  const { items, totalLines, orderCount, quantity, revenue, orderRevenue } = await fetchOrderReportPage(filters);

  const pageCount = Math.max(1, Math.ceil(totalLines / ORDER_REPORT_PAGE_SIZE));
  const fromRow = totalLines === 0 ? 0 : (filters.page - 1) * ORDER_REPORT_PAGE_SIZE + 1;
  const toRow = Math.min(filters.page * ORDER_REPORT_PAGE_SIZE, totalLines);
  const href = (page: number) => {
    const qs = orderReportQueryString({ ...filters, page });
    return qs ? `/orders?${qs}` : "/orders";
  };
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
            Live Aveska Neto orders in Australia/Sydney time. Product lines are listed separately from postage; order
            total matches the store (product plus shipping).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={exportHref("csv")}>Export CSV</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={exportHref("xlsx")}>Export Excel</Link>
          </Button>
        </div>
      </div>

      <div className="surface space-y-3 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold">Sync from Aveska</h2>
          <p className="text-sm text-muted-foreground">
            Choose today, the last month, or any date range. The app pulls orders placed in that window and orders
            updated on the website in that window, so store edits are not missed.
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
          <Input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="Customer, email, product, SKU, order #"
          />
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
            {items.map((item) => {
              const vehicle = vehicleLabelForOrderItem(item);
              return (
                <tr key={item.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap p-3">{formatDate(item.order.orderDate)}</td>
                  <td className="whitespace-nowrap">{item.order.externalId ?? item.order.id.slice(0, 8)}</td>
                  <td>{orderStatusLabel(item.order) || "—"}</td>
                  <td>
                    <Link href={`/customers/${item.order.customerId}`} className="font-medium hover:underline">
                      {item.order.customer.name}
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{item.order.customer.email ?? "—"}</td>
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
                  <td className="max-w-xs">{vehicle || "—"}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">{formatCurrency(item.unitPrice != null ? Number(item.unitPrice) : null)}</td>
                  <td className="text-right">{formatCurrency(item.lineTotal != null ? Number(item.lineTotal) : null)}</td>
                  <td className="text-right">{formatCurrency(orderShippingAmount(item.order))}</td>
                  <td className="text-right">{formatCurrency(item.order.orderTotal != null ? Number(item.order.orderTotal) : null)}</td>
                </tr>
              );
            })}
            {!items.length ? (
              <tr>
                <td colSpan={12} className="p-6 text-sm text-muted-foreground">
                  {totalLines === 0 && !filters.q && !filters.from && !filters.to ? (
                    <>
                      No live Neto orders in this database yet. Use <strong>Sync from Aveska</strong> above with today
                      or a date range to pull real orders from the store.
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
            <Link href={href(filters.page - 1)} className="pager">
              Previous
            </Link>
          ) : (
            <span className="pager opacity-50">Previous</span>
          )}
          <span className="text-muted-foreground">
            Page {filters.page} of {pageCount}
          </span>
          {filters.page < pageCount ? (
            <Link href={href(filters.page + 1)} className="pager">
              Next
            </Link>
          ) : (
            <span className="pager opacity-50">Next</span>
          )}
        </div>
      </div>
    </div>
  );
}
