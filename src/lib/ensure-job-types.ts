import { prisma } from "@/lib/db";

export async function ensureJobTypeEnum() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'NETO_SYNC'`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|duplicate/i.test(message)) {
      console.error("Could not ensure JobType enum", error);
    }
  }
}
