import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import type { D1Database, R2Bucket } from "@/types/cloudflare-bindings";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  aveskaD1?: D1Database;
};

export type WorkerBindings = {
  DB: D1Database;
  UPLOADS?: R2Bucket;
};

/** Call from the Worker entry before handling a request so Prisma uses D1. */
export function bindWorkerDb(env: WorkerBindings) {
  globalForPrisma.aveskaD1 = env.DB;
  globalForPrisma.prisma = undefined;
}

function createClient() {
  if (globalForPrisma.aveskaD1) {
    return new PrismaClient({
      // PrismaD1 expects the real D1Database at runtime.
      adapter: new PrismaD1(globalForPrisma.aveskaD1 as never),
      log: ["error"],
    });
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
    const value = Reflect.get(globalForPrisma.prisma, prop, receiver);
    return typeof value === "function" ? value.bind(globalForPrisma.prisma) : value;
  },
});
