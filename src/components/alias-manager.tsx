"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type VehicleRow = { id: string; canonicalName: string; aliases: Array<{ id: string; alias: string }> };

export function AliasManager({ vehicles }: { vehicles: VehicleRow[] }) {
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <a className="text-sm text-primary hover:underline" href="/api/vehicles/aliases/export">
          Export aliases CSV
        </a>
      </div>
      {vehicles.map((vehicle) => (
        <form
          key={vehicle.id}
          className="surface p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const alias = String(new FormData(e.currentTarget).get("alias") ?? "");
            setPending(true);
            const res = await fetch("/api/vehicles/aliases", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vehicleId: vehicle.id, alias }),
            });
            setPending(false);
            if (!res.ok) toast.error("Could not add alias");
            else window.location.reload();
          }}
        >
          <div className="font-semibold">{vehicle.canonicalName}</div>
          <div className="mt-1 text-sm text-muted-foreground">{vehicle.aliases.map((a) => a.alias).join(" · ") || "No aliases"}</div>
          <div className="mt-3 flex gap-2">
            <Input name="alias" placeholder="Add alias e.g. Falcon XB" />
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </div>
        </form>
      ))}
    </div>
  );
}
