import { processNextJob } from "@/lib/jobs/queue";
import { prisma } from "@/lib/db";

async function loop() {
  console.log("Aveska worker started");
  for (;;) {
    const queued = await prisma.job.findFirst({ where: { status: "QUEUED" } });
    if (queued) {
      try {
        await processNextJob(queued.id);
      } catch (error) {
        console.error("Job failed", error);
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

loop().catch((error) => {
  console.error(error);
  process.exit(1);
});
