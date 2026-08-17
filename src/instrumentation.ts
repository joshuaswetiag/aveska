export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ensureAdminUser } = await import("@/lib/ensure-admin");
    await ensureAdminUser();
  } catch (error) {
    console.error("Could not ensure admin user", error);
  }
}
