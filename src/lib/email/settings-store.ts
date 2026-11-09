import { prisma } from "@/lib/db";
import type { StoredMailSettings } from "@/lib/email/config";
import { openSecret, sealSecret } from "@/lib/email/secret-box";

export type MailSettingsRow = StoredMailSettings & {
  fromName?: string | null;
};

export async function loadMailSettings(): Promise<MailSettingsRow | null> {
  const row = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!row) return null;
  const smtpPassword = openSecret(row.smtpPassword);
  const maropostApiKey = openSecret(row.maropostApiKey);
  if (row.smtpPassword !== sealSecret(row.smtpPassword) || row.maropostApiKey !== sealSecret(row.maropostApiKey)) {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        smtpPassword: sealSecret(row.smtpPassword),
        maropostApiKey: sealSecret(row.maropostApiKey),
      },
    });
  }
  return {
    emailProvider: row.emailProvider,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    replyTo: row.replyTo,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort == null ? null : Number(row.smtpPort),
    smtpSecure: Boolean(row.smtpSecure),
    smtpUser: row.smtpUser,
    smtpPassword,
    emailSendDelayMs: row.emailSendDelayMs == null ? 200 : Number(row.emailSendDelayMs),
    maropostAccountId: row.maropostAccountId,
    maropostApiKey,
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
      smtpPassword: sealSecret(data.smtpPassword),
      emailSendDelayMs: data.emailSendDelayMs,
      maropostAccountId: data.maropostAccountId,
      maropostApiKey: sealSecret(data.maropostApiKey),
      maropostCampaignName: data.maropostCampaignName,
    },
  });
}
