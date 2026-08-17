import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { enqueueJob } from "@/lib/jobs/queue";
import { runJobInBackground } from "@/lib/jobs/run-in-background";
import { formatFromHeader, getMailConfig } from "@/lib/email/config";
import { loadMailSettings } from "@/lib/email/settings-store";
import { eligibleRecipients } from "@/lib/campaign/send-targets";
import { normalizeEmail } from "@/lib/utils";

const SENDABLE = new Set(["APPROVED", "EXPORTED", "SENDING", "SENT"]);

async function sendSummary(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { recipients: { include: { customer: true } } },
  });
  if (!campaign) return null;
  const settings = await loadMailSettings();
  const config = getMailConfig(settings, {
    fromName: campaign.fromName || settings?.fromName,
    fromEmail: settings?.fromEmail,
    replyTo: campaign.replyTo || settings?.replyTo,
  });
  const suppressed = new Set(
    (await prisma.suppression.findMany({ select: { emailNormalized: true } })).map((row) => row.emailNormalized),
  );
  const pending = eligibleRecipients(
    campaign.recipients.map((row) => ({
      id: row.id,
      email: row.customer.email,
      emailNormalized: row.customer.emailNormalized,
      isSuppressed: row.customer.isSuppressed,
      sent: row.sent,
    })),
    suppressed,
  ).length;
  const sent = campaign.recipients.filter((row) => row.sent).length;
  const failed = campaign.recipients.filter((row) => row.sendError && !row.sent).length;
  const running = await prisma.job.findFirst({
    where: { type: "SEND_CAMPAIGN", status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  const runningThis =
    running && (running.payload as { campaignId?: string } | null)?.campaignId === campaignId ? running.id : null;
  return {
    campaignId,
    status: campaign.status,
    configured: config.configured,
    provider: config.provider,
    from: formatFromHeader(config),
    pending,
    sent,
    failed,
    total: campaign.recipients.length,
    sendable: SENDABLE.has(campaign.status),
    runningJobId: runningThis,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const summary = await sendSummary(id);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(summary);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "READONLY") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const summary = await sendSummary(id);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!summary.configured) {
    return NextResponse.json(
      { error: "Email is not configured. Add SMTP details under Settings." },
      { status: 400 },
    );
  }
  if (!summary.sendable) {
    return NextResponse.json({ error: "Approve the campaign before sending." }, { status: 400 });
  }
  if (summary.runningJobId) {
    return NextResponse.json({ jobId: summary.runningJobId, alreadyRunning: true });
  }

  const body = (await request.json().catch(() => ({}))) as { testTo?: string; recipientId?: string };
  const testTo = normalizeEmail(body.testTo);
  if (!testTo && summary.pending === 0) {
    return NextResponse.json({ error: "Every eligible recipient has already been sent." }, { status: 400 });
  }

  const job = await enqueueJob({
    type: "SEND_CAMPAIGN",
    payload: { campaignId: id, testTo: testTo ?? undefined, recipientId: body.recipientId },
    createdById: session.user.id,
    total: testTo ? 1 : summary.pending,
  });
  await audit({
    userId: session.user.id,
    action: testTo ? "campaign_send_test" : "campaign_send",
    entityType: "Campaign",
    entityId: id,
    metadata: { jobId: job.id, testTo, pending: summary.pending },
  });
  runJobInBackground(job.id);
  return NextResponse.json({ jobId: job.id, pending: summary.pending, test: Boolean(testTo) });
}
