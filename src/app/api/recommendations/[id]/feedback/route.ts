import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { RecommendationStatus } from "@prisma/client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { status } = (await request.json()) as { status: RecommendationStatus };
  await prisma.recommendation.update({ where: { id }, data: { status } });
  await audit({ userId: session.user.id, action: "recommendation_feedback", entityType: "Recommendation", entityId: id, metadata: { status } });
  return NextResponse.json({ ok: true });
}
