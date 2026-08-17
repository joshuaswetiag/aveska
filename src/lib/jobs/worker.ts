import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

declare global {
  var aveskaJobWorkerStarted: boolean | undefined;
  var aveskaJobWorkerBusy: boolean | undefined;
}

const ranAsScript = process.argv.some((arg) => arg.replace(/\\/g, "/").includes("jobs/worker"));

async function recoverOrphanedJobs() {
  const result = await prisma.job.updateMany({
    where: {
      status: "RUNNING",
      updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: "QUEUED", message: "Waiting for worker…" },
  });
  if (result.count) console.log(`Requeued ${result.count} interrupted job(s)`);
}

async function nextSendJob() {
  return prisma.job.findFirst({
    where: {
      type: "SEND_CAMPAIGN",
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", progress: 0, updatedAt: { lt: new Date(Date.now() - 45_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

async function nextBackgroundJob() {
  return prisma.job.findFirst({
    where: {
      type: { not: "SEND_CAMPAIGN" },
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", updatedAt: { lt: new Date(Date.now() - 90_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

async function nextJob() {
  return (await nextSendJob()) ?? (await nextBackgroundJob());
}

async function tick() {
  if (globalThis.aveskaJobWorkerBusy) return;
  globalThis.aveskaJobWorkerBusy = true;
  try {
    const job = await nextJob();
    if (job) await processNextJob(job.id);
  } finally {
    globalThis.aveskaJobWorkerBusy = false;
  }
}

async function loop() {
  console.log("Aveska job worker started");
  let current: Promise<unknown> | null = null;
  let sending: Promise<unknown> | null = null;
  for (;;) {
    try {
      const send = await nextSendJob();
      if (send && !sending) {
        sending = processNextJob(send.id)
          .catch((error) => console.error("Send job failed", send.id, error))
          .finally(() => {
            sending = null;
          });
      }
      if (!current) {
        const job = await nextBackgroundJob();
        if (job) {
          current = processNextJob(job.id)
            .catch((error) => console.error("Job failed", job.id, error))
            .finally(() => {
              current = null;
            });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      console.error("Job worker loop error", error);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

export function startJobWorker() {
  if (globalThis.aveskaJobWorkerStarted) return;
  globalThis.aveskaJobWorkerStarted = true;
  console.log("Aveska in-process job worker started");
  void tick().catch((error) => console.error("Job worker tick failed", error));
  setInterval(() => {
    void tick().catch((error) => console.error("Job worker tick failed", error));
  }, 2000);
}

if (ranAsScript) {
  void recoverOrphanedJobs()
    .then(() => loop())
    .catch((error) => {
      console.error("Job worker failed to start", error);
      process.exit(1);
    });
}
