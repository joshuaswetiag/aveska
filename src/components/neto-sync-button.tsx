"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function NetoSyncButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/catalogue/neto-sync", { method: "POST" });
        const data = await res.json();
        setPending(false);
        if (!res.ok) {
          toast.error(data.error ?? "Live sync could not start");
          return;
        }
        toast.success("Live catalogue sync started");
        router.push(`/jobs/${data.jobId}`);
      }}
    >
      {pending ? "Starting…" : "Sync live Aveska catalogue"}
    </Button>
  );
}
