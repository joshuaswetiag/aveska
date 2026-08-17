"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AnalyseButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/analyse", { method: "POST" });
        const data = await res.json();
        setPending(false);
        if (!res.ok) {
          toast.error(data.error ?? "Analyse failed");
          return;
        }
        toast.success("Customer analysis started");
        router.push(`/jobs/${data.jobId}`);
      }}
    >
      {pending ? "Starting…" : "Analyse customers"}
    </Button>
  );
}

export function DemoButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await fetch("/api/demo", { method: "POST" });
        const data = await res.json();
        setPending(false);
        if (!res.ok) {
          toast.error(data.error ?? "Demo failed");
          return;
        }
        toast.success("Demo started");
        router.push(`/jobs/${data.jobId}`);
      }}
    >
      {pending ? "Starting…" : "Run demo"}
    </Button>
  );
}
