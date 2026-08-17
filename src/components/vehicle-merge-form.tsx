"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

export function VehicleMergeForm({
  customerId,
  vehicles,
}: {
  customerId: string;
  vehicles: Array<{ id: string; name: string }>;
}) {
  const [pending, setPending] = useState(false);
  if (vehicles.length < 2) return null;
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setPending(true);
        const res = await fetch(`/api/customers/${customerId}/vehicles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "merge",
            fromId: form.get("fromId"),
            toId: form.get("toId"),
          }),
        });
        setPending(false);
        if (!res.ok) toast.error("Could not merge vehicle profiles");
        else window.location.reload();
      }}
    >
      <select name="fromId" className="w-auto min-w-40">
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            Merge {v.name}
          </option>
        ))}
      </select>
      <select name="toId" className="w-auto min-w-40">
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            into {v.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Merge profiles
      </Button>
    </form>
  );
}
