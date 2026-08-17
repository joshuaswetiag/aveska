"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function JobPoller({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const kicked = useRef(false);
  useEffect(() => {
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") return;
    if (status === "QUEUED" && !kicked.current) {
      kicked.current = true;
      void fetch(`/api/jobs/${id}/process`, { method: "POST" }).catch(() => undefined);
    }
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [id, status, router]);
  return null;
}
