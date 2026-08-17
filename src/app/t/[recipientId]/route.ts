import { NextResponse } from "next/server";
import { isAllowedTrackingDestination, recordCampaignTraffic } from "@/lib/email/tracking-record";

export async function GET(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;
  const dest = new URL(request.url).searchParams.get("u")?.trim() || "";
  if (!dest || !isAllowedTrackingDestination(dest)) {
    return NextResponse.redirect("https://www.aveska.com.au", 302);
  }
  await recordCampaignTraffic({ recipientId, type: "CLICK", url: dest }).catch(() => null);
  return NextResponse.redirect(dest, 302);
}
