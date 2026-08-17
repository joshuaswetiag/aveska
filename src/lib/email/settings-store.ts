import { prisma } from "@/lib/db";
import type { StoredMailSettings } from "@/lib/email/config";

export type MailSettingsRow = StoredMailSettings & {
  fromName?: string | null;
};

export async function loadMailSettings(): Promise<MailSettingsRow | null> {
  const rows = await prisma.$queryRaw<MailSettingsRow[]>`
    SELECT
      "emailProvider",
      "fromName",
      "fromEmail",
      "replyTo",
      "smtpHost",
      "smtpPort",
      "smtpSecure",
      "smtpUser",
      "smtpPassword",
      "emailSendDelayMs",
      "maropostAccountId",
      "maropostApiKey",
      "maropostCampaignName"
    FROM "Settings"
    WHERE id = 'default'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    smtpPort: row.smtpPort == null ? null : Number(row.smtpPort),
    smtpSecure: Boolean(row.smtpSecure),
    emailSendDelayMs: row.emailSendDelayMs == null ? 200 : Number(row.emailSendDelayMs),
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
  await prisma.$executeRaw`
    UPDATE "Settings"
    SET
      "emailProvider" = ${data.emailProvider},
      "fromName" = ${data.fromName},
      "fromEmail" = ${data.fromEmail},
      "replyTo" = ${data.replyTo},
      "smtpHost" = ${data.smtpHost},
      "smtpPort" = ${data.smtpPort},
      "smtpSecure" = ${data.smtpSecure},
      "smtpUser" = ${data.smtpUser},
      "smtpPassword" = ${data.smtpPassword},
      "emailSendDelayMs" = ${data.emailSendDelayMs},
      "maropostAccountId" = ${data.maropostAccountId},
      "maropostApiKey" = ${data.maropostApiKey},
      "maropostCampaignName" = ${data.maropostCampaignName},
      "updatedAt" = NOW()
    WHERE id = 'default'
  `;
}
