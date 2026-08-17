import { after } from "next/server";
import { processNextJob } from "@/lib/jobs/queue";

export function runJobInBackground(jobId: string) {
  after(() =>
    processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    }),
  );
}
