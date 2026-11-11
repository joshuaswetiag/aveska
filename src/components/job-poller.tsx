"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/router";

export function JobPoller({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const kicked = useRef<string | null>(null);
  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") return;
    const kick = () => {
      if (status !== "QUEUED" && status !== "RUNNING") return;
      void fetch(`/api/jobs/${id}/process`, { method: "POST" }).catch(() => undefined);
    };
    if (kicked.current !== id) {
      kicked.current = id;
      kick();
    }
    const refreshTimer = setInterval(() => router.refresh(), 1500);
    const continueTimer = setInterval(kick, 15000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(continueTimer);
    };
  }, [id, status, router]);
  return null;
}
