"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SendSummary = {
  configured: boolean;
  provider: string;
  from: string;
  pending: number;
  sent: number;
  failed: number;
  total: number;
  sendable: boolean;
  runningJobId: string | null;
};

export function CampaignActions({ id, status }: { id: string; status: string }) {
  const [pending, setPending] = useState(false);
  const [mail, setMail] = useState<SendSummary | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/campaigns/${id}/send`)
      .then((res) => res.json())
      .then((data) => setMail(data))
      .catch(() => undefined);
  }, [id]);

  async function act(action: string) {
    if (action === "delete" && !window.confirm("Delete this campaign and all generated promotions?")) return;
    setPending(true);
    const res = await fetch(`/api/campaigns/${id}/${action}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error("Action failed");
      return;
    }
    if (action === "delete") {
      toast.success("Campaign deleted");
      router.push("/campaigns");
      router.refresh();
      return;
    }
    if (action === "duplicate" && data.campaignId) {
      toast.success("Duplicated");
      router.push(`/campaigns/${data.campaignId}`);
      return;
    }
    toast.success(action === "approve" ? "Approved — ready to send or export" : "Updated");
    window.location.reload();
  }

  async function send(body: { testTo?: string } = {}) {
    setPending(true);
    const res = await fetch(`/api/campaigns/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(data.error ?? "Could not start send");
      return;
    }
    toast.success(body.testTo ? "Sending test email…" : "Sending campaign emails…");
    router.push(`/jobs/${data.jobId}`);
  }

  const canSend = Boolean(mail?.sendable && mail.configured && (mail.pending > 0 || status === "APPROVED" || status === "EXPORTED" || status === "SENT"));

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => act("duplicate")}>
        Duplicate
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => act("archive")}>
        Archive
      </Button>
      {status !== "APPROVED" && status !== "EXPORTED" && status !== "SENDING" && status !== "SENT" ? (
        <Button disabled={pending} onClick={() => act("approve")}>
          Approve
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={pending || !mail?.configured}
        onClick={() => {
          const address = window.prompt("Send a test copy of the first promotion to this address:");
          if (!address?.trim()) return;
          void send({ testTo: address.trim() });
        }}
      >
        Send test
      </Button>
      <Button
        disabled={pending || !canSend || Boolean(mail?.runningJobId) || (mail?.pending ?? 0) === 0}
        onClick={() => {
          const count = mail?.pending ?? 0;
          if (
            !window.confirm(
              `Send ${count.toLocaleString()} personalized email${count === 1 ? "" : "s"} from ${mail?.from ?? "Aveska"} via ${mail?.provider.toUpperCase()}?\n\nAlready-sent and suppressed addresses are skipped. This cannot be undone.`,
            )
          ) {
            return;
          }
          void send();
        }}
      >
        {mail?.runningJobId ? "Sending…" : mail?.pending ? `Send ${mail.pending.toLocaleString()} emails` : "Send emails"}
      </Button>
      <a href={`/api/campaigns/${id}/export?format=csv`}>
        <Button variant="outline" type="button">
          Export CSV
        </Button>
      </a>
      <a href={`/api/campaigns/${id}/export?format=xlsx`}>
        <Button variant="outline" type="button">
          Export XLSX
        </Button>
      </a>
      <Button variant="danger" disabled={pending} onClick={() => act("delete")}>
        Delete
      </Button>
      {mail && !mail.configured ? (
        <p className="basis-full text-sm text-muted-foreground">
          Bulk send is off until SMTP is saved under Settings.
        </p>
      ) : null}
      {mail?.configured ? (
        <p className="basis-full text-sm text-muted-foreground">
          {mail.sent.toLocaleString()} sent · {mail.pending.toLocaleString()} remaining · {mail.failed.toLocaleString()} failed · from {mail.from}
        </p>
      ) : null}
    </div>
  );
}
