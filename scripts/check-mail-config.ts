import { prisma } from "../src/lib/db";
import { getMailConfig } from "../src/lib/email/config";

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const mail = getMailConfig(settings);
  console.log(JSON.stringify({
    emailProvider: settings?.emailProvider,
    smtpHost: settings?.smtpHost,
    smtpPort: settings?.smtpPort,
    smtpUser: settings?.smtpUser,
    fromEmail: settings?.fromEmail,
    fromName: settings?.fromName,
    hasPassword: Boolean(settings?.smtpPassword),
    configured: mail.configured,
    provider: mail.provider,
    host: mail.host,
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
