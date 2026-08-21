import { prisma } from "@/lib/db";
import { SettingsForm } from "@/components/settings-form";
import { MailSettingsForm } from "@/components/mail-settings-form";
import { formatFromHeader, getMailConfig, runningOnRailway } from "@/lib/email/config";
import { loadMailSettings } from "@/lib/email/settings-store";
import { loadTrackingUrl } from "@/lib/email/tracking-record";
import { auth } from "@/auth";

export default async function SettingsPage() {
  const session = await auth();
  const settings = await prisma.settings.upsert({ where: { id: "default" }, update: {}, create: {} });
  const mailSettings = await loadMailSettings();
  const trackingUrl = (await loadTrackingUrl()) ?? "";
  const mail = getMailConfig(mailSettings);
  const canEdit = session?.user.role === "ADMIN";
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>
      <p className="text-sm">
        <a href="/settings/templates" className="text-primary hover:underline">
          Email template editor
        </a>
      </p>
      <MailSettingsForm
        canEdit={canEdit}
        hostedOnRailway={runningOnRailway()}
        mail={{
          configured: mail.configured,
          provider: mail.provider,
          from: formatFromHeader(mail),
          hostLabel: mail.provider === "resend" ? "Resend HTTPS" : mail.host ? `${mail.host}:${mail.port}` : null,
          emailProvider: mail.provider,
          fromName: mailSettings?.fromName || settings.fromName,
          fromEmail: mailSettings?.fromEmail ?? "",
          replyTo: mailSettings?.replyTo ?? "",
          smtpHost: mailSettings?.smtpHost ?? "",
          smtpPort: mailSettings?.smtpPort ?? mail.port,
          smtpSecure: Boolean(mailSettings?.smtpSecure),
          smtpUser: mailSettings?.smtpUser ?? "",
          smtpPasswordSet: mail.smtpPasswordSet,
          emailSendDelayMs: mailSettings?.emailSendDelayMs ?? 200,
          maropostAccountId: mailSettings?.maropostAccountId ?? "",
          maropostApiKeySet: mail.maropostApiKeySet,
          maropostCampaignName: mailSettings?.maropostCampaignName ?? "aveska-intelligence",
        }}
      />
      <SettingsForm
        settings={{
          cooldownDays: settings.cooldownDays,
          confidenceThreshold: Number(settings.confidenceThreshold),
          includeOutOfStock: settings.includeOutOfStock,
          utmEnabled: settings.utmEnabled,
          shopUrl: settings.shopUrl ?? "",
          contactUrl: settings.contactUrl ?? "",
          companyName: settings.companyName,
          trackingUrl,
          reduceScoreSameFamily: settings.reduceScoreSameFamily,
        }}
      />
    </div>
  );
}
