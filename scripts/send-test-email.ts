import nodemailer from "nodemailer";
import { prisma } from "../src/lib/db";
import { renderEmailHtml } from "../src/lib/email/provider";
import { htmlWithInlineLogo, restyleCampaignHtml } from "../src/lib/email/logo";
import { loadMailSettings } from "../src/lib/email/settings-store";
import { formatFromHeader, getMailConfig, getMailPassword } from "../src/lib/email/config";

const TEST_TO = "nadimmahmudytd@gmail.com";

async function main() {
  let campaign = await prisma.campaign.findFirst({
    where: { recipients: { some: { bodyHtml: { not: null } } } },
    orderBy: { createdAt: "desc" },
    include: { recipients: { take: 1, orderBy: { createdAt: "asc" } } },
  });

  if (!campaign) {
    const html = renderEmailHtml(
      {
        subject: "Aveska SMTP test",
        preheader: "This is a connection test from Aveska Intelligence.",
        greeting: "Hi Nadim,",
        body: "This is a test email from Aveska Intelligence. SMTP is connected and campaign send is working.",
        ctaLabel: "Visit Aveska",
        ctaUrl: "https://www.aveska.com.au",
        footer: "Aveska Auto & Restoration Parts — test message, not a customer promotion.",
      },
      [{ name: "Sample restoration part", url: "https://www.aveska.com.au", price: "$0.00" }],
    );
    campaign = await prisma.campaign.create({
      data: {
        name: "SMTP test",
        slug: `smtp-test-${Date.now()}`,
        type: "CROSS_SELL",
        status: "APPROVED",
        subject: "Aveska SMTP test",
        preheader: "This is a connection test from Aveska Intelligence.",
        bodyHtml: html,
        approvedAt: new Date(),
      },
      include: { recipients: { take: 1 } },
    });
  } else if (!["APPROVED", "EXPORTED", "SENDING", "SENT"].includes(campaign.status)) {
    campaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "APPROVED", approvedAt: new Date() },
      include: { recipients: { take: 1, orderBy: { createdAt: "asc" } } },
    });
  }

  const settings = await loadMailSettings();
  const config = getMailConfig(settings);
  if (!config.configured || !config.host) throw new Error("SMTP is not configured in Settings.");

  const rawHtml = campaign.recipients[0]?.bodyHtml || campaign.bodyHtml;
  const subject = `[TEST] ${campaign.recipients[0]?.subject || campaign.subject || campaign.name}`;
  if (!rawHtml) throw new Error("Campaign has no HTML to send.");

  const previewHtml = restyleCampaignHtml(rawHtml);
  if (campaign.recipients[0]?.id) {
    await prisma.campaignRecipient.update({
      where: { id: campaign.recipients[0].id },
      data: { bodyHtml: previewHtml },
    });
  }
  if (campaign.bodyHtml) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { bodyHtml: restyleCampaignHtml(campaign.bodyHtml) },
    });
  }

  const outbound = htmlWithInlineLogo(previewHtml);
  const info = await nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: getMailPassword(settings) } : undefined,
  }).sendMail({
    from: formatFromHeader(config),
    to: TEST_TO,
    subject,
    html: outbound.html,
    attachments: outbound.attachments,
    replyTo: config.replyTo || undefined,
  });

  console.log(JSON.stringify({
    ok: true,
    to: TEST_TO,
    campaignId: campaign.id,
    name: campaign.name,
    subject,
    messageId: info.messageId,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
