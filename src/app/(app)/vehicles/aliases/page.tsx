import { AliasManager } from "@/components/alias-manager";
import { PageState, usePageData } from "@/lib/use-page-data";

type AliasVehicle = { id: string; canonicalName: string; aliases: Array<{ id: string; alias: string }> };

export default function AliasPage() {
  const state = usePageData<AliasVehicle[]>("/api/views/vehicles/aliases", { search: false });
  return (
    <PageState {...state}>
      {(vehicles) => (
        <div className="space-y-4">
          <h1 className="font-display text-3xl font-semibold">Vehicle alias manager</h1>
          <p className="text-muted-foreground">Canonical vehicle names plus aliases used during extraction and matching. Import/export supported.</p>
          <AliasManager vehicles={vehicles} />
        </div>
      )}
    </PageState>
  );
}
