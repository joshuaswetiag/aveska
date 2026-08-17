"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmailPreview } from "@/components/email-preview";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type CampaignRecipientRow = {
  id: string;
  customerName: string;
  email: string | null;
  vehicleLabel: string | null;
  purchasedProduct: string | null;
  subject: string | null;
  preheader: string | null;
  bodyHtml: string | null;
  createdAt: string;
  sent: boolean;
  sendError: string | null;
  opened?: boolean;
  clicked?: boolean;
};

export function CampaignRecipientList({
  campaignSubject,
  campaignPreheader,
  campaignHtml,
  recipients,
}: {
  campaignSubject: string;
  campaignPreheader: string;
  campaignHtml: string;
  recipients: CampaignRecipientRow[];
}) {
  const [selectedId, setSelectedId] = useState(recipients[0]?.id ?? null);
  const selected = recipients.find((row) => row.id === selectedId) ?? recipients[0];

  if (!selected) return null;

  return (
    <div className="space-y-6">
      <EmailPreview
        customerName={selected.customerName}
        subject={selected.subject ?? campaignSubject}
        preheader={selected.preheader ?? campaignPreheader}
        html={selected.bodyHtml ?? campaignHtml}
      />
      <div className="overflow-x-auto surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Customer</th>
              <th>Email</th>
              <th>Vehicle</th>
              <th>Purchased</th>
              <th>Subject</th>
              <th>Generated</th>
              <th>Status</th>
              <th className="p-3 text-right"> </th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((row) => {
              const active = row.id === selected.id;
              return (
                <tr key={row.id} className={`border-t border-border ${active ? "bg-muted/50" : ""}`}>
                  <td className="p-3 font-medium">{row.customerName}</td>
                  <td className="text-muted-foreground">{row.email ?? "—"}</td>
                  <td>{row.vehicleLabel ?? "—"}</td>
                  <td className="max-w-xs">{row.purchasedProduct ?? "—"}</td>
                  <td className="max-w-xs">{row.subject ?? "—"}</td>
                  <td className="whitespace-nowrap">{formatDate(row.createdAt)}</td>
                  <td>
                    {row.sent ? (
                      <Badge variant="success">Sent</Badge>
                    ) : row.sendError ? (
                      <Badge variant="danger" title={row.sendError}>
                        Failed
                      </Badge>
                    ) : (
                      <Badge variant="muted">Queued</Badge>
                    )}
                    {row.clicked ? (
                      <Badge variant="success" className="ml-1">
                        Clicked
                      </Badge>
                    ) : row.opened ? (
                      <Badge variant="muted" className="ml-1">
                        Opened
                      </Badge>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => {
                        setSelectedId(row.id);
                        document.getElementById("campaign-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
