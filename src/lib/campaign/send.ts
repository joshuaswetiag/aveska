import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";
import { formatFromHeader, getMailConfig } from "@/lib/email/config";
import { restyleCampaignHtml } from "@/lib/email/brand";
import { wrapEmailHtmlForTracking, isStableTrackingOrigin } from "@/lib/email/tracking";
import { resolveTrackingBaseUrl } from "@/lib/email/tracking-record";
import { loadMailSettings } from "@/lib/email/settings-store";
import { getEmailTransport } from "@/lib/email/smtp";
import { eligibleRecipients } from "@/lib/campaign/send-targets";
import { unsubscribeUrl } from "@/lib/campaign/unsubscribe-token";
import { readEnv } from "@/lib/read-env";

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
  if ((readEnv("NODE_ENV") === "production" || readEnv("AVESKA_RUNTIME") === "worker") && !isStableTrackingOrigin(trackingBase)) {
    throw new Error(
      "Set AUTH_URL and TRACKING_URL to the Cloudflare https URL so click tracking works worldwide.",
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
      "test",
      trackingBase ?? "",
      { companyName: settings?.companyName, postalAddress: settings?.postalAddress },
    );
    const transport = await getEmailTransport();
    await options.onProgress?.(0, 1, connectingMessage(config.provider, config.host, config.port));
    await transport.send({
      to: options.testTo,
      subject: `[TEST] ${sample?.subject || campaign.subject || campaign.name}`,
      html,
      from: formatFromHeader(config),
      listUnsubscribe: trackingBase ? `${trackingBase.replace(/\/$/, "")}/t/test/unsubscribe` : undefined,
    });
    await options.onProgress?.(1, 1, `Test sent to ${options.testTo}`);
    return { test: true, campaignId, to: options.testTo, sent: 1, failed: 0, skipped: 0, remaining: 0 };
  }

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId, sent: false },
    select: {
      id: true,
      sent: true,
      sendError: true,
      subject: true,
      customerId: true,
      customer: { select: { email: true, emailNormalized: true, isSuppressed: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const emails = [...new Set(recipients.map((row) => row.customer.emailNormalized).filter((email): email is string => Boolean(email)))];
  const suppressed = new Set<string>();
  for (let index = 0; index < emails.length; index += 90) {
    const rows = await prisma.suppression.findMany({
      where: { emailNormalized: { in: emails.slice(index, index + 90) } },
      select: { emailNormalized: true },
    });
    for (const row of rows) suppressed.add(row.emailNormalized);
  }
  const candidates = eligibleRecipients(
    recipients.map((row) => ({
      id: row.id,
      email: row.customer.email,
      emailNormalized: row.customer.emailNormalized,
      isSuppressed: row.customer.isSuppressed,
      sent: row.sent,
      subject: row.subject,
    })),
    suppressed,
    { recipientId: options?.recipientId },
  );

  if (!candidates.length) {
    throw new Error(
      "No unsent recipients with a valid email. Suppressed, already-sent, and eBay (@members.ebay.com) addresses are skipped.",
    );
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });
  const transport = await getEmailTransport();
  await options?.onProgress?.(0, candidates.length, connectingMessage(config.provider, config.host, config.port));
  const from = formatFromHeader(config);
  let sent = 0;
  let failed = 0;
  let paused = false;
  const errors: string[] = [];
  const startedAt = Date.now();

  let remaining = candidates.length;
  try {
    for (const [index, candidate] of candidates.entries()) {
      const recipient = recipients.find((row) => row.id === candidate.id);
      const to = recipient?.customer.emailNormalized || normalizeEmail(recipient?.customer.email);
      const subject = recipient?.subject || campaign.subject || campaign.name;
      await options?.onProgress?.(index, candidates.length, `Sending ${index + 1} / ${candidates.length}`);
      if (!recipient || !to) {
        failed += 1;
        continue;
      }
      const frequencyDays = settings?.campaignFrequencyDays ?? 30;
      if (frequencyDays > 0) {
        const prior = await prisma.campaignRecipient.findFirst({
          where: {
            customerId: recipient.customerId,
            sent: true,
            sentAt: { gte: new Date(Date.now() - frequencyDays * 86_400_000) },
            id: { not: recipient.id },
          },
          select: { id: true },
        });
        if (prior) {
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { sendError: "Skipped: emailed inside the frequency window" },
          });
          continue;
        }
      }
      const current = await prisma.campaignRecipient.findUnique({
        where: { id: recipient.id },
        select: { sent: true, sendError: true, bodyHtml: true },
      });
      if (!current || current.sent) continue;
      if (current.sendError?.startsWith("SENT:")) {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            sent: true,
            sentAt: new Date(),
            sendError: null,
            providerMessageId: current.sendError.slice(5),
            delivered: true,
          },
        });
        sent += 1;
        continue;
      }
      if (current.sendError?.startsWith("CLAIM:")) {
        const at = Number(current.sendError.slice(6));
        if (Number.isFinite(at) && Date.now() - at < 90_000) continue;
      }
      const claim = await prisma.campaignRecipient.updateMany({
        where: { id: recipient.id, sent: false, sendError: current.sendError },
        data: { sendError: `CLAIM:${Date.now()}` },
      });
      if (claim.count === 0) continue;
      const body = restyleCampaignHtml(current.bodyHtml || campaign.bodyHtml || "");
      const trackedHtml = wrapEmailHtmlForTracking(body, recipient.id, trackingBase ?? "", {
        companyName: settings?.companyName,
        postalAddress: settings?.postalAddress,
      });
      const listUnsubscribe = trackingBase ? unsubscribeUrl(trackingBase, recipient.id) : undefined;
      let result: { id: string };
      try {
        result = await transport.send({
          to,
          subject,
          html: trackedHtml,
          from,
          idempotencyKey: `aveska-${recipient.id}`,
          listUnsubscribe,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Send failed";
        failed += 1;
        errors.push(`${to}: ${message}`);
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { sendError: message.slice(0, 500) },
        });
        if (config.delayMs) await sleep(config.delayMs);
        continue;
      }
      try {
        await prisma.campaignRecipient.update({
          where: { id: recipient.id },
          data: { sent: true, sentAt: new Date(), sendError: null, providerMessageId: result.id, delivered: true },
        });
        sent += 1;
      } catch (error) {
        console.error("Email was accepted but the recipient could not be marked sent", error);
        await prisma.campaignRecipient
          .update({
            where: { id: recipient.id },
            data: { sendError: `SENT:${result.id}`.slice(0, 500) },
          })
          .catch(() => undefined);
      }
      if (config.delayMs) await sleep(config.delayMs);
      const onWorker = readEnv("AVESKA_RUNTIME") === "worker";
      if (onWorker && Date.now() - startedAt > 20_000 && index < candidates.length - 1) {
        paused = true;
        break;
      }
    }
  } finally {
    remaining = await prisma.campaignRecipient.count({
      where: {
        campaignId,
        sent: false,
        customer: {
          isSuppressed: false,
          NOT: { emailNormalized: { endsWith: "@members.ebay.com" } },
        },
        OR: [{ sendError: null }, { sendError: { startsWith: "CLAIM:" } }, { sendError: { startsWith: "SENT:" } }],
      },
    });
    const sentCount = await prisma.campaignRecipient.count({ where: { campaignId, sent: true } });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        sent: sentCount,
        sentAt: sentCount > 0 ? new Date() : campaign.sentAt,
        status: paused ? "SENDING" : sentCount > 0 ? "SENT" : campaign.status === "EXPORTED" ? "EXPORTED" : "APPROVED",
      },
    });
  }

  await options?.onProgress?.(candidates.length, candidates.length, `Sent ${sent}, failed ${failed}`);
  if (sent === 0 && failed > 0) {
    throw new Error(errors[0] || "All emails failed to send.");
  }
  return { test: false, campaignId, sent, failed, skipped: recipients.length - candidates.length, remaining, paused };
}
