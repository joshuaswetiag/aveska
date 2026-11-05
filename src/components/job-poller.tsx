"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/router";

export function JobPoller({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") return;
    if (status === "QUEUED") {
      void fetch(`/api/jobs/${id}/process`, { method: "POST" }).catch(() => undefined);
    }
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [id, status, router]);
  return null;
}
