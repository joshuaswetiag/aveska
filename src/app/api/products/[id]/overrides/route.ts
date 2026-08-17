import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await request.json()) as {
    make?: string;
    series?: string[];
    isCompatible: boolean;
    notes?: string;
  };
  const override = await prisma.fitmentOverride.create({
    data: {
      productId: id,
      make: body.make || null,
      series: body.series ?? [],
      isCompatible: body.isCompatible,
      notes: body.notes,
      createdById: session.user.id,
    },
  });
  await audit({ userId: session.user.id, action: "fitment_override", entityType: "Product", entityId: id });
  return NextResponse.json(override);
}
