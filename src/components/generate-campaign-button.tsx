"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function GenerateCampaignButton({
  customerId,
  vehicleId,
  segmentId,
  name,
}: {
  customerId?: string;
  vehicleId?: string;
  segmentId?: string;
  name?: string;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      disabled={pending}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPending(true);
        const res = await fetch("/api/campaigns/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId, vehicleId, segmentId, name }),
        });
        const data = await res.json();
        setPending(false);
        if (!res.ok) {
          toast.error(data.error ?? "Could not generate campaign");
          return;
        }
        toast.success(data.jobId ? "Matching customers to in-stock parts…" : "Campaign generated for review");
        router.push(data.jobId ? `/jobs/${data.jobId}` : `/campaigns/${data.campaignId}`);
      }}
    >
      {pending ? "Generating…" : "Generate campaign"}
    </Button>
  );
}
