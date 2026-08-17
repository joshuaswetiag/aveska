import { setImmediate as nodeImmediate } from "node:timers";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";

export function runJobInBackground(jobId: string) {
  startJobWorker();
  nodeImmediate(() => {
    void processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    });
  });
}
