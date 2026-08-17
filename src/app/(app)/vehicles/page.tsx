import { prisma } from "@/lib/db";
import Link from "next/link";
import { GenerateCampaignButton } from "@/components/generate-campaign-button";

export default async function VehiclesPage() {
  const vehicles = await prisma.vehicle.findMany({
    include: {
      _count: { select: { customerVehicles: true, fitments: true, recommendations: true } },
    },
    orderBy: { canonicalName: "asc" },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">Vehicles</h1>
        <Link href="/vehicles/aliases" className="text-sm text-primary hover:underline">
          Alias manager
        </Link>
      </div>
      <div className="surface">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-muted-foreground">
            <tr>
              <th className="p-3">Vehicle</th>
              <th>Customers</th>
              <th>Catalogue products</th>
              <th>Recommendations</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id} className="border-t border-border">
                <td className="p-3">
                  <Link href={`/vehicles/${vehicle.id}`} className="font-medium hover:underline">
                    {vehicle.canonicalName}
                  </Link>
                </td>
                <td>{vehicle._count.customerVehicles}</td>
                <td>{vehicle._count.fitments}</td>
                <td>{vehicle._count.recommendations}</td>
                <td>
                  <GenerateCampaignButton vehicleId={vehicle.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
