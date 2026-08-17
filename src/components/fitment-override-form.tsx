"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function FitmentOverrideForm({ productId }: { productId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin fitment override</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setPending(true);
            const res = await fetch(`/api/products/${productId}/overrides`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                make: form.get("make"),
                series: String(form.get("series") ?? "")
                  .split(/[/,+\s]+/)
                  .filter(Boolean),
                isCompatible: form.get("compatible") === "yes",
                notes: form.get("notes"),
              }),
            });
            setPending(false);
            if (!res.ok) toast.error("Could not save override");
            else {
              toast.success("Override saved — this takes priority over extraction");
              window.location.reload();
            }
          }}
        >
          <Input name="make" placeholder="Make e.g. Ford" required />
          <Input name="series" placeholder="Series e.g. XB XC" />
          <select name="compatible">
            <option value="yes">Compatible with</option>
            <option value="no">NOT compatible with</option>
          </select>
          <Input name="notes" placeholder="Notes" />
          <Button type="submit" disabled={pending} className="sm:col-span-2">
            Save override
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
