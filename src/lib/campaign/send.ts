import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";
import { formatFromHeader, getMailConfig } from "@/lib/email/config";
import { restyleCampaignHtml } from "@/lib/email/brand";
import { wrapEmailHtmlForTracking, isStableTrackingOrigin } from "@/lib/email/tracking";
import { resolveTrackingBaseUrl } from "@/lib/email/tracking-record";
import { loadMailSettings } from "@/lib/email/settings-store";
import { getEmailTransport } from "@/lib/email/smtp";
import { eligibleRecipients } from "@/lib/campaign/send-targets";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectingMessage(provider: string, host: string | null, port: number) {
  if (provider === "resend") return "Sending via Resend…";
  return `Connecting to ${host}:${port}…`;
}

export async function sendCampaign(
  campaignId: string,
  options?: {
    testTo?: string;
    recipientId?: string;
    onProgress?: (done: number, total: number, message?: string) => Promise<void>;
  },
) {
  await options?.onProgress?.(0, options?.testTo ? 1 : 0, "Loading campaign…");

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");
  if (!["APPROVED", "EXPORTED", "SENDING", "SENT"].includes(campaign.status)) {
    throw new Error("Approve the campaign before sending email.");
  }

  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const mailSettings = await loadMailSettings();
  const config = getMailConfig(mailSettings, {
    fromName: campaign.fromName || mailSettings?.fromName || settings?.fromName,
    fromEmail: mailSettings?.fromEmail,
    replyTo: campaign.replyTo || mailSettings?.replyTo || settings?.replyTo,
  });
  if (!config.configured) {
    throw new Error("Email sending is not configured. Add SMTP details under Settings.");
  }
  const trackingBase = await resolveTrackingBaseUrl();
  if (process.env.NODE_ENV === "production" && !isStableTrackingOrigin(trackingBase)) {
    throw new Error(
      "Set AUTH_URL and TRACKING_URL to the Railway https domain (Generate Domain) so click tracking works worldwide.",
    );
  }

  if (options?.testTo) {
    const sample = options.recipientId
      ? await prisma.campaignRecipient.findFirst({
          where: { id: options.recipientId, campaignId },
        })
      : await prisma.campaignRecipient.findFirst({
          where: { campaignId },
          orderBy: { createdAt: "asc" },
        });
    if (!sample?.bodyHtml && !campaign.bodyHtml) throw new Error("This campaign has no email HTML to send.");
    const html = wrapEmailHtmlForTracking(
      restyleCampaignHtml(sample?.bodyHtml || campaign.bodyHtml || ""),
      sample?.id || campaign.id,
      trackingBase ?? "",
    );
    const transport = await getEmailTransport();
    await options.onProgress?.(0, 1, connectingMessage(config.provider, config.host, config.port));
    await transport.send({
      to: options.testTo,
      subject: `[TEST] ${sample?.subject || campaign.subject || campaign.name}`,
      html,
      from: formatFromHeader(config),
    });
    await options.onProgress?.(1, 1, `Test sent to ${options.testTo}`);
    return { test: true, campaignId, to: options.testTo, sent: 1, failed: 0, skipped: 0, remaining: 0 };
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });
  const suppressed = new Set(
    (await prisma.suppression.findMany({ select: { emailNormalized: true } })).map((row) => row.emailNormalized),
  );
  const candidates = eligibleRecipients(
    recipients.map((row) => ({
      id: row.id,
      email: row.customer.email,
      emailNormalized: row.customer.emailNormalized,
      isSuppressed: row.customer.isSuppressed,
      sent: row.sent,
      bodyHtml: row.bodyHtml,
      subject: row.subject,
    })),
    suppressed,
    { recipientId: options?.recipientId },
  );

  if (!candidates.length) {
    throw new Error("No unsent recipients with a valid email. Suppressed and already-sent people are skipped.");
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
  const transport = await getEmailTransport();
  await options?.onProgress?.(0, candidates.length, connectingMessage(config.provider, config.host, config.port));
  const from = formatFromHeader(config);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  let remaining = candidates.length;
  try {
    for (const [index, candidate] of candidates.entries()) {
      const recipient = recipients.find((row) => row.id === candidate.id);
      const to = recipient?.customer.emailNormalized || normalizeEmail(recipient?.customer.email);
      const html = wrapEmailHtmlForTracking(
        restyleCampaignHtml(recipient?.bodyHtml || campaign.bodyHtml || ""),
        recipient?.id || campaignId,
        trackingBase ?? "",
      );
      const subject = recipient?.subject || campaign.subject || campaign.name;
      await options?.onProgress?.(index, candidates.length, `Sending ${index + 1} / ${candidates.length}`);
      if (!recipient || !to || !html) {
        failed += 1;
        continue;
      }
      try {
        const result = await transport.send({ to, subject, html, from });
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { sent: true, sentAt: new Date(), sendError: null, providerMessageId: result.id, delivered: true },
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed";
        failed += 1;
        errors.push(`${to}: ${message}`);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { sendError: message.slice(0, 500) },
        });
      }
      if (config.delayMs) await sleep(config.delayMs);
    }
  } finally {
    remaining = await prisma.campaignRecipient.count({ where: { campaignId, sent: false } });
    const sentCount = await prisma.campaignRecipient.count({ where: { campaignId, sent: true } });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sent: sentCount,
        sentAt: sentCount > 0 ? new Date() : campaign.sentAt,
        status: sentCount > 0 ? "SENT" : campaign.status === "EXPORTED" ? "EXPORTED" : "APPROVED",
      },
    });
  }

  await options?.onProgress?.(candidates.length, candidates.length, `Sent ${sent}, failed ${failed}`);
  if (sent === 0 && failed > 0) {
    throw new Error(errors[0] || "All emails failed to send.");
  }
  return { test: false, campaignId, sent, failed, skipped: recipients.length - candidates.length, remaining };
}
