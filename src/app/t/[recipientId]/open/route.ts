import { trackingPixelResponse, recordCampaignTraffic } from "@/lib/email/tracking-record";

export async function GET(_: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;
  await recordCampaignTraffic({ recipientId: decodeURIComponent(recipientId), type: "OPEN" }).catch(() => null);
  return trackingPixelResponse();
}
