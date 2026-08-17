import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { JobProcessButton } from "@/components/job-process-button";
import { Badge } from "@/components/ui/badge";
import { JobPoller } from "@/components/job-poller";
import { Button } from "@/components/ui/button";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) notFound();
  const pct = job.total ? Math.round((job.progress / job.total) * 100) : job.status === "COMPLETED" ? 100 : 0;
  return (
    <div className="space-y-6">
      <JobPoller id={job.id} status={job.status} />
      <div>
        <h1 className="font-display text-3xl font-semibold">{job.type.replaceAll("_", " ")}</h1>
        <p className="mt-1 text-muted-foreground">
          <Badge>{job.status}</Badge> {job.message}
        </p>
      </div>
      <Progress value={pct} />
      <p className="text-sm text-muted-foreground">
        Processing: {job.progress.toLocaleString()} / {(job.total || 0).toLocaleString()}
      </p>
      {job.errorMessage ? <p className="text-sm text-danger">{job.errorMessage}</p> : null}
      {job.status === "COMPLETED" && (job.result as { campaignId?: string } | null)?.campaignId ? (
        <div className="space-y-2">
          {(job.result as { sent?: number; failed?: number; test?: boolean }).sent != null ? (
            <p className="text-sm text-muted-foreground">
              {(job.result as { test?: boolean }).test ? "Test email sent." : null}{" "}
              Sent {(job.result as { sent: number }).sent.toLocaleString()}
              {(job.result as { failed?: number }).failed
                ? ` · ${(job.result as { failed: number }).failed.toLocaleString()} failed`
                : ""}
            </p>
          ) : null}
          {(job.result as { orders?: number; recipients?: number }).orders != null ? (
            <p className="text-sm text-muted-foreground">
              {(job.result as { orders: number }).orders.toLocaleString()} orders in the selected dates
              {(job.result as { synced?: { imported?: number } }).synced?.imported != null
                ? ` · synced ${(job.result as { synced: { imported: number } }).synced.imported.toLocaleString()} from Aveska`
                : ""}
              {" · "}
              {(job.result as { recipients?: number }).recipients?.toLocaleString() ?? "0"} promotions
              {(job.result as { skippedNoVehicle?: number }).skippedNoVehicle
                ? ` · ${(job.result as { skippedNoVehicle: number }).skippedNoVehicle} without a vehicle match`
                : ""}
              {(job.result as { skippedNoStock?: number }).skippedNoStock
                ? ` · ${(job.result as { skippedNoStock: number }).skippedNoStock} without matching parts`
                : ""}
              {(job.result as { skippedNoEmail?: number }).skippedNoEmail
                ? ` · ${(job.result as { skippedNoEmail: number }).skippedNoEmail} without email`
                : ""}
            </p>
          ) : null}
          <Button asChild>
            <Link href={`/campaigns/${(job.result as { campaignId: string }).campaignId}`}>
              Open campaign
              {(job.result as { recipients?: number }).recipients != null
                ? ` (${(job.result as { recipients: number }).recipients.toLocaleString()} promotions)`
                : ""}
            </Link>
          </Button>
        </div>
      ) : null}
      {job.status === "QUEUED" || job.status === "FAILED" ? <JobProcessButton jobId={job.id} /> : null}
      {job.status === "FAILED" && (job.payload as { campaignId?: string } | null)?.campaignId ? (
        <Button asChild variant="outline">
          <Link href={`/campaigns/${(job.payload as { campaignId: string }).campaignId}`}>Back to campaign</Link>
        </Button>
      ) : null}
    </div>
  );
}
