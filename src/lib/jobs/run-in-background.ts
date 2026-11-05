import { setImmediate as nodeImmediate } from "node:timers";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";

export function runJobInBackground(jobId: string) {
  if (process.env.AVESKA_RUNTIME === "worker") return;
  startJobWorker();
  nodeImmediate(() => {
    void processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    });
  });
}
