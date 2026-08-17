import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { saveTrackingUrl } from "@/lib/email/tracking-record";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const settings = await prisma.settings.update({
    where: { id: "default" },
    data: {
      cooldownDays: Number(body.cooldownDays),
      confidenceThreshold: Number(body.confidenceThreshold),
      includeOutOfStock: Boolean(body.includeOutOfStock),
      utmEnabled: Boolean(body.utmEnabled),
      reduceScoreSameFamily: Boolean(body.reduceScoreSameFamily),
      shopUrl: body.shopUrl || null,
      contactUrl: body.contactUrl || null,
      companyName: body.companyName || "Aveska",
    },
  });
  await saveTrackingUrl(typeof body.trackingUrl === "string" && body.trackingUrl.trim() ? body.trackingUrl.trim().replace(/\/$/, "") : null);
  await audit({ userId: session.user.id, action: "settings_update", entityType: "Settings", entityId: "default" });
  return NextResponse.json(settings);
}
