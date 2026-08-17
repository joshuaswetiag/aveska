export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { ensureAdminUser } = await import("@/lib/ensure-admin");
    await ensureAdminUser();
  } catch (error) {
    console.error("Could not ensure admin user", error);
  }
  const { startJobWorker } = await import("@/lib/jobs/worker");
  startJobWorker();
}
