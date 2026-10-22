import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";
import { formatCurrency, formatDate } from "@/lib/utils";

type CustomerRow = {
  id: string;
  name: string;
  email: string | null;
  totalOrders: number;
  totalSpend: string | number;
  lastPurchaseAt: string | null;
  isSuppressed: boolean;
  vehicles: Array<{ vehicle: { canonicalName: string } }>;
};

export default function CustomersPage() {
  const state = usePageData<{ q: string; customers: CustomerRow[] }>("/api/views/customers");
  return (
    <PageState {...state}>
      {({ q, customers }) => (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <form>
            <Input name="q" defaultValue={q} placeholder="Search name or email" className="max-w-md" />
          </form>
          <div className="surface">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="p-3">Customer</th>
                  <th>Vehicles</th>
                  <th>Orders</th>
                  <th>Spend</th>
                  <th>Last purchase</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-border">
                    <td className="p-3">
                      <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                        {customer.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{customer.email ?? "No email"}</div>
                    </td>
                    <td className="max-w-xs">{customer.vehicles.map((row) => row.vehicle.canonicalName).join(" · ") || "—"}</td>
                    <td>{customer.totalOrders}</td>
                    <td>{formatCurrency(Number(customer.totalSpend))}</td>
                    <td>{formatDate(customer.lastPurchaseAt)}</td>
                    <td>{customer.isSuppressed ? <Badge variant="warning">Suppressed</Badge> : <Badge variant="success">Active</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageState>
  );
}
