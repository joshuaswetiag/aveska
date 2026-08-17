import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, action } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "approve") {
    await prisma.campaign.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedById: session.user.id },
    });
    await audit({ userId: session.user.id, action: "campaign_approve", entityType: "Campaign", entityId: id });
  } else if (action === "archive") {
    await prisma.campaign.update({ where: { id }, data: { status: "ARCHIVED" } });
  } else if (action === "duplicate") {
    const copy = await prisma.campaign.create({
      data: {
        name: `${campaign.name} (copy)`,
        slug: `${slugify(campaign.name)}-copy-${Date.now().toString().slice(-4)}`,
        type: campaign.type,
        status: "DRAFT",
        subject: campaign.subject,
        preheader: campaign.preheader,
        bodyHtml: campaign.bodyHtml,
        fromName: campaign.fromName,
        replyTo: campaign.replyTo,
      },
    });
    return NextResponse.json({ campaignId: copy.id });
  } else if (action === "delete") {
    await prisma.campaign.delete({ where: { id } });
    await audit({ userId: session.user.id, action: "campaign_delete", entityType: "Campaign", entityId: id });
    return NextResponse.json({ ok: true, deleted: true });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
