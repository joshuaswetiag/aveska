"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { applyTemplate } from "@/lib/email/apply-template";
import { toast } from "sonner";

const SAMPLE = {
  first_name: "John",
  vehicle: "Ford Falcon XB/XC Sedan",
  make: "Ford",
  model: "Falcon",
  series: "XB/XC",
  purchased_product: "Seat Belts",
  product_1_name: "Ford XB/XC Rear Quarter Repair Panel",
  product_1_url: "https://aveska.com.au",
  product_1_price: "$245.00",
  product_2_name: "",
  product_2_url: "",
  product_2_price: "",
  product_3_name: "",
  product_3_url: "",
  product_3_price: "",
  shop_url: "https://aveska.com.au",
  contact_url: "https://aveska.com.au/contact",
};

export function TemplateEditor({
  template,
}: {
  template: {
    id: string;
    name: string;
    subject: string;
    preheader: string | null;
    bodyHtml: string;
    ctaLabel: string | null;
    ctaUrl: string | null;
  };
}) {
  const [subject, setSubject] = useState(template.subject);
  const [preheader, setPreheader] = useState(template.preheader ?? "");
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const preview = useMemo(
    () => applyTemplate(`${subject}\n${preheader}\n${bodyHtml}`, SAMPLE),
    [subject, preheader, bodyHtml],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface space-y-3 p-5">
        <Input defaultValue={template.name} name="name" />
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Preheader" />
        <Textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} className="min-h-64 font-mono text-xs" />
        <div className="flex gap-2 text-xs text-muted-foreground">
          Heading · Paragraph · Button · Product card · Divider · Link
        </div>
        <Button
          onClick={async () => {
            const res = await fetch("/api/templates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: template.id === "new" ? undefined : template.id,
                name: template.name,
                subject,
                preheader,
                bodyHtml,
                ctaLabel: template.ctaLabel,
                ctaUrl: template.ctaUrl,
              }),
            });
            if (!res.ok) toast.error("Could not save template");
            else toast.success("Template saved");
          }}
        >
          Save template
        </Button>
      </div>
      <div className="surface p-5">
        <div className="text-xs uppercase text-muted-foreground">HTML preview</div>
        <pre className="mt-2 whitespace-pre-wrap text-sm">{preview}</pre>
      </div>
    </div>
  );
}
