import { after } from "next/server";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";

export function runJobInBackground(jobId: string) {
  startJobWorker();
  const run = () =>
    processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    });
  try {
    after(run);
  } catch {
    setImmediate(run);
  }
  setImmediate(run);
}
