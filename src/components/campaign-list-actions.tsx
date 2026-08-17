"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignListActions({ id, name }: { id: string; name: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm(`Delete campaign “${name}”?`)) return;
        setPending(true);
        const res = await fetch(`/api/campaigns/${id}/delete`, { method: "POST" });
        setPending(false);
        if (!res.ok) {
          toast.error("Could not delete campaign");
          return;
        }
        toast.success("Campaign deleted");
        router.refresh();
      }}
    >
      Delete
    </Button>
  );
}
