import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateCampaign } from "@/lib/campaign/generate";
import { enqueueJob, processNextJob } from "@/lib/jobs/queue";
import { audit } from "@/lib/audit";
import type { CampaignType } from "@prisma/client";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json()) as {
    name?: string;
    customerId?: string;
    vehicleId?: string;
    segmentId?: string;
    type?: CampaignType;
    from?: string;
    to?: string;
  };
  const name = body.name?.trim() || "Vehicle cross-sell";
  const payload = {
    name,
    customerIds: body.customerId ? [body.customerId] : undefined,
    vehicleId: body.vehicleId,
    segmentId: body.segmentId,
    type: body.type ?? "CROSS_SELL",
    from: body.from,
    to: body.to,
    createdById: session.user.id,
  };

  if ((body.from && body.to) || body.vehicleId) {
    const job = await enqueueJob({
      type: "GENERATE_CAMPAIGN",
      payload,
      createdById: session.user.id,
    });
    await audit({ userId: session.user.id, action: "campaign_generate", entityType: "Job", entityId: job.id });
    void processNextJob(job.id).catch(() => undefined);
    return NextResponse.json({ jobId: job.id });
  }

  const campaign = await generateCampaign(payload);
  await audit({ userId: session.user.id, action: "campaign_generate", entityType: "Campaign", entityId: campaign.id });
  return NextResponse.json({ campaignId: campaign.id });
}
