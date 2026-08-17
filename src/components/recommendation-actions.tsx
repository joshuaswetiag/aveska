"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const ACTIONS = [
  ["APPROVED", "Approve"],
  ["REJECTED", "Reject"],
  ["INCORRECT_FITMENT", "Incorrect fitment"],
  ["NOT_RELEVANT", "Not relevant"],
  ["ALREADY_PURCHASED", "Already purchased"],
  ["EXCELLENT_MATCH", "Excellent match"],
] as const;

export function RecommendationActions({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {ACTIONS.map(([status, label]) => (
        <Button
          key={status}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const res = await fetch(`/api/recommendations/${id}/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status }),
            });
            setPending(false);
            if (!res.ok) toast.error("Could not save feedback");
            else {
              toast.success("Feedback saved");
              window.location.reload();
            }
          }}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
