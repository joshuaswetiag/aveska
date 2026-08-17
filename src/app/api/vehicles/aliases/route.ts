import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeKey } from "@/lib/utils";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { vehicleId, alias } = (await request.json()) as { vehicleId: string; alias: string };
  const created = await prisma.vehicleAlias.upsert({
    where: { aliasNormalized: normalizeKey(alias) },
    update: { vehicleId, alias },
    create: { vehicleId, alias, aliasNormalized: normalizeKey(alias) },
  });
  await audit({ userId: session.user.id, action: "alias_create", entityType: "VehicleAlias", entityId: created.id });
  return NextResponse.json(created);
}
