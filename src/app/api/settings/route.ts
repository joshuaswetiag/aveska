import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { saveTrackingUrl } from "@/lib/email/tracking-record";
import { isEphemeralTrackingOrigin, isLocalTrackingOrigin, isStableTrackingOrigin } from "@/lib/email/tracking";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const trackingUrl =
    typeof body.trackingUrl === "string" && body.trackingUrl.trim() ? body.trackingUrl.trim().replace(/\/$/, "") : null;
  if (trackingUrl && isEphemeralTrackingOrigin(trackingUrl)) {
    return NextResponse.json(
      { error: "Cloudflare tunnel URLs die when they restart. Use the Railway https URL so clicks work worldwide." },
      { status: 400 },
    );
  }
  if (trackingUrl && !isStableTrackingOrigin(trackingUrl) && !isLocalTrackingOrigin(trackingUrl)) {
    return NextResponse.json(
      { error: "Use an https URL like https://aveska-production.up.railway.app" },
      { status: 400 },
    );
  }
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
  await saveTrackingUrl(trackingUrl);
  await audit({ userId: session.user.id, action: "settings_update", entityType: "Settings", entityId: "default" });
  return NextResponse.json(settings);
}
