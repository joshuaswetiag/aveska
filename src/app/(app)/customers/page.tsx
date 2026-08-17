import { prisma } from "@/lib/db";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { vehicles: { include: { vehicle: true } }, segments: { include: { segment: true } } },
    orderBy: { lastPurchaseAt: "desc" },
    take: 100,
  });
  return (
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
                <td className="max-w-xs">
                  {customer.vehicles.map((v) => v.vehicle.canonicalName).join(" · ") || "—"}
                </td>
                <td>{customer.totalOrders}</td>
                <td>{formatCurrency(Number(customer.totalSpend))}</td>
                <td>{formatDate(customer.lastPurchaseAt)}</td>
                <td>
                  {customer.isSuppressed ? <Badge variant="warning">Suppressed</Badge> : <Badge variant="success">Active</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
