"use client";

import { useState } from "react";

const MOBILE_PREVIEW_CSS = `
html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
table { width: 100% !important; max-width: 100% !important; }
table[width="600"] { width: 100% !important; max-width: 100% !important; }
td { word-break: break-word !important; overflow-wrap: anywhere !important; }
img { max-width: 100% !important; height: auto !important; }
`;

function previewHtml(html: string, mode: "desktop" | "mobile") {
  if (mode !== "mobile") return html;
  const inject = `<meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${MOBILE_PREVIEW_CSS}</style>`;
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  if (/<html[\s>]/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
  return `<!DOCTYPE html><html><head>${inject}</head><body>${html}</body></html>`;
}

export function EmailPreview({
  subject,
  preheader,
  html,
  customerName,
}: {
  subject: string;
  preheader: string;
  html: string;
  customerName?: string;
}) {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");
  const mobile = mode === "mobile";
  return (
    <div id="campaign-preview" className="space-y-3">
      <div className="surface p-5">
        <div className="text-xs uppercase text-muted-foreground">Subject{customerName ? ` · ${customerName}` : ""}</div>
        <div className="font-semibold">{subject}</div>
        <div className="text-sm text-muted-foreground">{preheader}</div>
      </div>
      <div className="flex gap-2">
        <button className={`rounded-lg px-3 py-1.5 text-sm transition-all ${mode === "desktop" ? "bg-gradient-to-r from-primary to-accent text-white shadow-[0_8px_18px_var(--glow)]" : "bg-muted hover:bg-border"}`} onClick={() => setMode("desktop")}>
          Desktop
        </button>
        <button className={`rounded-lg px-3 py-1.5 text-sm transition-all ${mode === "mobile" ? "bg-gradient-to-r from-primary to-accent text-white shadow-[0_8px_18px_var(--glow)]" : "bg-muted hover:bg-border"}`} onClick={() => setMode("mobile")}>
          Mobile
        </button>
      </div>
      <div className="flex justify-center overflow-x-auto rounded-2xl border border-border bg-muted/60 p-4">
        <iframe
          title="Email preview"
          className="min-h-[640px] rounded-md bg-white shadow"
          style={{
            width: mobile ? 375 : 640,
            maxWidth: "100%",
            overflowX: "hidden",
          }}
          srcDoc={previewHtml(html, mode)}
        />
      </div>
    </div>
  );
}
