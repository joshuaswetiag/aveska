"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function TrafficDeleteButton({ id }: { id?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const clearAll = !id;

  async function remove() {
    if (
      !window.confirm(
        clearAll
          ? "Delete all email traffic? Opens and clicks will be cleared from this list."
          : "Delete this traffic row?",
      )
    ) {
      return;
    }
    setPending(true);
    const res = await fetch(clearAll ? "/api/traffic?all=1" : `/api/traffic?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setPending(false);
    if (!res.ok) {
      toast.error("Could not delete traffic");
      return;
    }
    toast.success(clearAll ? "Traffic cleared" : "Traffic row deleted");
    router.refresh();
  }

  return (
    <Button type="button" variant="danger" size="sm" disabled={pending} onClick={() => void remove()}>
      {pending ? "Deleting…" : clearAll ? "Delete all traffic" : "Delete"}
    </Button>
  );
}
