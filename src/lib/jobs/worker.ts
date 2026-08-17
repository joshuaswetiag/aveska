import { setImmediate as nodeImmediate } from "node:timers";
import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

declare global {
  var aveskaJobWorkerStarted: boolean | undefined;
}

const ranAsScript = process.argv.some((arg) => arg.replace(/\\/g, "/").includes("jobs/worker"));

async function recoverOrphanedJobs() {
  const result = await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      OR: [{ startedAt: null }, { startedAt: { lt: new Date(Date.now() - 30_000) } }],
    },
    data: { status: "QUEUED", message: "Waiting for worker…" },
  });
  if (result.count) console.log(`Requeued ${result.count} interrupted job(s)`);
}

async function loop() {
  console.log("Aveska job worker started");
  for (;;) {
    try {
      const queued = await prisma.job.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
      });
      if (queued) {
        try {
          await processNextJob(queued.id);
        } catch (error) {
          console.error("Job failed", queued.id, error);
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (error) {
      console.error("Job worker loop error", error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function startJobWorker() {
  if (globalThis.aveskaJobWorkerStarted) return;
  globalThis.aveskaJobWorkerStarted = true;
  nodeImmediate(() => {
    void loop().catch((error) => {
      globalThis.aveskaJobWorkerStarted = false;
      console.error("Job worker stopped", error);
    });
  });
}

if (ranAsScript) {
  void recoverOrphanedJobs()
    .then(() => startJobWorker())
    .catch((error) => {
      console.error("Job worker failed to start", error);
      process.exit(1);
    });
}
