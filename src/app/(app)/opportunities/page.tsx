import Link from "next/link";
import { getCrossSellOpportunities } from "@/lib/campaign/opportunities";
import { GenerateCampaignButton } from "@/components/generate-campaign-button";
import { Card, CardContent } from "@/components/ui/card";

export default async function OpportunitiesPage() {
  const groups = await getCrossSellOpportunities();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-semibold">Cross-sell opportunities</h1>
        <p className="text-muted-foreground">
          Customers grouped by the vehicle extracted from their orders. Potential products are catalogue fitments for
          that application.
        </p>
      </div>
      <div className="stagger-in grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <Card key={`${group.name}:${group.make ?? ""}`}>
            <CardContent>
            {group.vehicleId ? (
              <Link href={`/vehicles/${group.vehicleId}`} className="font-display text-xl font-semibold hover:underline">
                {group.name}
              </Link>
            ) : (
              <div className="font-display text-xl font-semibold">{group.name}</div>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>Customers: {group.customers.toLocaleString()}</div>
              <div>Eligible: {group.eligible.toLocaleString()}</div>
              <div>Order lines: {group.orderLines.toLocaleString()}</div>
              <div>Potential products: {group.potentialProducts.toLocaleString()}</div>
            </dl>
            {group.vehicleId ? (
              <div className="mt-3">
                <GenerateCampaignButton vehicleId={group.vehicleId} name={`${group.name} cross-sell`} />
              </div>
            ) : null}
            </CardContent>
          </Card>
        ))}
        {!groups.length ? (
          <p className="text-muted-foreground">No vehicle applications found on orders yet. Sync live orders first.</p>
        ) : null}
      </div>
    </div>
  );
}
