import { prisma } from "@/lib/db";
import type { StoredMailSettings } from "@/lib/email/config";

export type MailSettingsRow = StoredMailSettings & {
  fromName?: string | null;
};

export async function loadMailSettings(): Promise<MailSettingsRow | null> {
  const row = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  return {
    emailProvider: row.emailProvider,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyTo: row.replyTo,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort == null ? null : Number(row.smtpPort),
    smtpSecure: Boolean(row.smtpSecure),
    smtpUser: row.smtpUser,
    smtpPassword: row.smtpPassword,
    emailSendDelayMs: row.emailSendDelayMs == null ? 200 : Number(row.emailSendDelayMs),
    maropostAccountId: row.maropostAccountId,
    maropostApiKey: row.maropostApiKey,
    maropostCampaignName: row.maropostCampaignName,
  };
}

export async function saveMailSettings(data: {
  emailProvider: string;
  fromName: string;
  fromEmail: string | null;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPassword: string | null;
  emailSendDelayMs: number;
  maropostAccountId: string | null;
  maropostApiKey: string | null;
  maropostCampaignName: string | null;
}) {
  await prisma.settings.update({
    where: { id: "default" },
    data: {
      emailProvider: data.emailProvider,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpSecure: data.smtpSecure,
      smtpUser: data.smtpUser,
      smtpPassword: data.smtpPassword,
      emailSendDelayMs: data.emailSendDelayMs,
      maropostAccountId: data.maropostAccountId,
      maropostApiKey: data.maropostApiKey,
      maropostCampaignName: data.maropostCampaignName,
    },
  });
}
