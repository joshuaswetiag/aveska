import { startJobWorker } from "@/lib/jobs/worker";

export function runJobInBackground(_jobId: string) {
  startJobWorker();
}
