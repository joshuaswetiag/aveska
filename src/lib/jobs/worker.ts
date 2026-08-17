import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

declare global {
  var aveskaJobWorkerStarted: boolean | undefined;
}

async function loop() {
  console.log("Aveska job worker started");
  for (;;) {
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
  }
}

export function startJobWorker() {
  if (globalThis.aveskaJobWorkerStarted) return;
  globalThis.aveskaJobWorkerStarted = true;
  void (async () => {
    await prisma.job.updateMany({
      where: { status: "RUNNING" },
      data: { status: "QUEUED", message: "Requeued after restart" },
    });
    await loop();
  })().catch((error) => {
    globalThis.aveskaJobWorkerStarted = false;
    console.error("Job worker stopped", error);
  });
}

const ranAsScript = process.argv[1]?.includes("worker");
if (ranAsScript) startJobWorker();
