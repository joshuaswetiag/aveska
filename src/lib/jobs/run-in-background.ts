import { setImmediate as nodeImmediate } from "node:timers";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";

export function runJobInBackground(jobId: string) {
  startJobWorker();
  if (process.env.AVESKA_SKIP_INLINE_WORKER === "1") return;
  nodeImmediate(() => {
    void processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    });
  });
}
