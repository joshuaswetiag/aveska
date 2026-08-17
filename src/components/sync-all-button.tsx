"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SyncAllButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
        const data = await res.json();
        setPending(false);
        if (!res.ok) {
          toast.error(data.error ?? "Could not start a full Aveska sync");
          return;
        }
        toast.success("Full store sync started");
        window.location.reload();
      }}
    >
      {pending ? "Starting…" : "Sync all from Aveska"}
    </Button>
  );
}
