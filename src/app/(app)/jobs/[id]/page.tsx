import { JobPoller } from "@/components/job-poller";
import { JobProcessButton } from "@/components/job-process-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link, useParams } from "@/lib/router";
import { PageState, usePageData } from "@/lib/use-page-data";

type JobResult = {
  campaignId?: string;
  sent?: number;
  failed?: number;
  test?: boolean;
  orders?: number;
  recipients?: number;
  skippedNoVehicle?: number;
  skippedNoStock?: number;
  skippedNoEmail?: number;
  synced?: { imported?: number };
};

type JobRow = {
  id: string;
  type: string;
  status: string;
  message: string | null;
  progress: number;
  total: number;
  errorMessage: string | null;
  result: JobResult | null;
  payload: { campaignId?: string } | null;
};

export default function JobPage() {
  const { id } = useParams();
  const state = usePageData<JobRow>(id ? `/api/views/jobs/${id}` : null, { search: false });
  return (
    <PageState {...state}>
      {(job) => {
        const pct = job.total ? Math.round((job.progress / job.total) * 100) : job.status === "COMPLETED" ? 100 : 0;
        const result = job.result;
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
            {job.status === "COMPLETED" && result?.campaignId ? (
              <div className="space-y-2">
                {result.sent != null ? (
                  <p className="text-sm text-muted-foreground">
                    {result.test ? "Test email sent." : null} Sent {result.sent.toLocaleString()}
                    {result.failed ? ` · ${result.failed.toLocaleString()} failed` : ""}
                  </p>
                ) : null}
                {result.orders != null ? (
                  <p className="text-sm text-muted-foreground">
                    {result.orders.toLocaleString()} orders in the selected dates
                    {result.synced?.imported != null ? ` · synced ${result.synced.imported.toLocaleString()} from Aveska` : ""} · {result.recipients?.toLocaleString() ?? "0"} promotions
                    {result.skippedNoVehicle ? ` · ${result.skippedNoVehicle} without a vehicle match` : ""}
                    {result.skippedNoStock ? ` · ${result.skippedNoStock} without matching parts` : ""}
                    {result.skippedNoEmail ? ` · ${result.skippedNoEmail} without email` : ""}
                  </p>
                ) : null}
                <Button asChild>
                  <Link href={`/campaigns/${result.campaignId}`}>
                    Open campaign
                    {result.recipients != null ? ` (${result.recipients.toLocaleString()} promotions)` : ""}
                  </Link>
                </Button>
              </div>
            ) : null}
            {job.status === "QUEUED" || job.status === "FAILED" || job.status === "RUNNING" ? <JobProcessButton jobId={job.id} /> : null}
            {job.status === "FAILED" && job.payload?.campaignId ? (
              <Button asChild variant="outline">
                <Link href={`/campaigns/${job.payload.campaignId}`}>Back to campaign</Link>
              </Button>
            ) : null}
          </div>
        );
      }}
    </PageState>
  );
}
