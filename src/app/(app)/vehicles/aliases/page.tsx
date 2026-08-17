import { prisma } from "@/lib/db";
import { AliasManager } from "@/components/alias-manager";

export default async function AliasPage() {
  const vehicles = await prisma.vehicle.findMany({ include: { aliases: true }, orderBy: { canonicalName: "asc" } });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">Vehicle alias manager</h1>
      <p className="text-muted-foreground">
        Canonical vehicle names plus aliases used during extraction and matching. Import/export supported.
      </p>
      <AliasManager
        vehicles={vehicles.map((v) => ({
          id: v.id,
          canonicalName: v.canonicalName,
          aliases: v.aliases.map((a) => ({ id: a.id, alias: a.alias })),
        }))}
      />
    </div>
  );
}
