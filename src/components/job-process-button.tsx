"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function JobProcessButton({ jobId }: { jobId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch(`/api/jobs/${jobId}/process`, { method: "POST" });
        setPending(false);
        if (!res.ok) toast.error("Could not process job");
        else window.location.reload();
      }}
    >
      {pending ? "Processing…" : "Process now"}
    </Button>
  );
}
