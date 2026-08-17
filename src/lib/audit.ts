import { prisma } from "@/lib/db";

export async function audit(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: object;
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as object | undefined,
    },
  });
}
