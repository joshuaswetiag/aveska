import { setImmediate as nodeImmediate } from "node:timers";
import { processNextJob } from "@/lib/jobs/queue";
import { startJobWorker } from "@/lib/jobs/worker";
import { readEnv } from "@/lib/read-env";

export function runJobInBackground(jobId: string) {
  if (readEnv("AVESKA_RUNTIME") === "worker") return;
  startJobWorker();
  nodeImmediate(() => {
    void processNextJob(jobId).catch((error) => {
      console.error("Background job failed", jobId, error);
    });
  });
}
