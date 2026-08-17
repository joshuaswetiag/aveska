"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast: "rounded-2xl border border-border/80 shadow-[0_16px_40px_rgba(22,48,66,0.12)]",
        },
      }}
    />
  );
}
