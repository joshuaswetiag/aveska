import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await request.json()) as { action: "merge" | "split"; fromId: string; toId?: string };
  const from = await prisma.customerVehicle.findFirst({ where: { id: body.fromId, customerId: id } });
  if (!from) return NextResponse.json({ error: "Vehicle profile not found" }, { status: 404 });

  if (body.action === "merge") {
    if (!body.toId) return NextResponse.json({ error: "Target vehicle required" }, { status: 400 });
    const to = await prisma.customerVehicle.findFirst({ where: { id: body.toId, customerId: id } });
    if (!to) return NextResponse.json({ error: "Target not found" }, { status: 404 });
    await prisma.recommendation.updateMany({
      where: { customerVehicleId: from.id },
      data: { customerVehicleId: to.id, vehicleId: to.vehicleId },
    });
    await prisma.customerVehicle.update({
      where: { id: to.id },
      data: { mergedFromIds: { push: from.vehicleId } },
    });
    await prisma.customerVehicle.delete({ where: { id: from.id } });
    await audit({ userId: session.user.id, action: "vehicle_merge", entityType: "Customer", entityId: id });
    return NextResponse.json({ ok: true });
  }

  await prisma.customerVehicle.update({
    where: { id: from.id },
    data: { isPrimary: false },
  });
  await audit({ userId: session.user.id, action: "vehicle_split", entityType: "Customer", entityId: id });
  return NextResponse.json({ ok: true });
}
