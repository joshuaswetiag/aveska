import { normalizeEmail } from "@/lib/utils";

export type MailProviderName = "export" | "smtp" | "maropost" | "resend";

export type StoredMailSettings = {
  emailProvider?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  emailSendDelayMs?: number | null;
  maropostAccountId?: string | null;
  maropostApiKey?: string | null;
  maropostCampaignName?: string | null;
};

export type MailConfig = {
  provider: MailProviderName;
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  fromEmail: string | null;
  fromName: string;
  replyTo: string | null;
  delayMs: number;
  maropostAccountId: string | null;
  maropostCampaignName: string | null;
  smtpPasswordSet: boolean;
  maropostApiKeySet: boolean;
};

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function text(stored: string | null | undefined, envName: string) {
  const value = stored?.trim();
  return value || env(envName);
}

export function parseMailProvider(raw: string | null | undefined): MailProviderName {
  const value = (raw ?? "export").trim().toLowerCase();
  if (value === "smtp" || value === "maropost" || value === "resend") return value;
  return "export";
}

export function getMailProviderName(stored?: StoredMailSettings | null): MailProviderName {
  if (stored?.emailProvider != null && stored.emailProvider !== "") {
    return parseMailProvider(stored.emailProvider);
  }
  return parseMailProvider(env("EMAIL_PROVIDER"));
}

export function getMailPassword(stored?: StoredMailSettings | null) {
  const provider = getMailProviderName(stored);
  if (provider === "resend") {
    return stored?.smtpPassword?.trim() || env("RESEND_API_KEY") || "";
  }
  if (provider === "maropost") {
    return stored?.maropostApiKey?.trim() || stored?.smtpPassword?.trim() || env("MAROPOST_API_KEY") || env("SMTP_PASSWORD") || "";
  }
  return stored?.smtpPassword?.trim() || env("SMTP_PASSWORD") || "";
}

export function getMailConfig(
  stored?: StoredMailSettings | null,
  overrides?: { fromName?: string | null; fromEmail?: string | null; replyTo?: string | null },
): MailConfig {
  const provider = getMailProviderName(stored);
  const maropost = provider === "maropost";
  const resend = provider === "resend";
  const host = resend
    ? "api.resend.com"
    : text(stored?.smtpHost, "SMTP_HOST") ?? (maropost ? "smtp.maropost.com" : null);
  const port = resend ? 443 : Number(stored?.smtpPort || env("SMTP_PORT") || (maropost ? "587" : "587")) || 587;
  const secure = resend ? true : stored?.smtpSecure ?? ((env("SMTP_SECURE") ?? "false").toLowerCase() === "true" || port === 465);
  const user = text(stored?.smtpUser, "SMTP_USER") ?? (maropost ? "apikey" : null);
  const fromEmail = normalizeEmail(overrides?.fromEmail) ?? normalizeEmail(stored?.fromEmail) ?? normalizeEmail(env("SMTP_FROM"));
  const fromName = overrides?.fromName?.trim() || stored?.fromName?.trim() || env("SMTP_FROM_NAME") || "Aveska";
  const replyTo = normalizeEmail(overrides?.replyTo) ?? normalizeEmail(stored?.replyTo) ?? normalizeEmail(env("SMTP_REPLY_TO"));
  const password = getMailPassword(stored);
  const maropostAccountId = text(stored?.maropostAccountId, "MAROPOST_ACCOUNT_ID");
  const configured = resend
    ? Boolean(fromEmail && password)
    : provider !== "export" && Boolean(host && fromEmail && (maropost ? maropostAccountId && password : password));

  return {
    provider,
    configured,
    host,
    port,
    secure,
    user,
    fromEmail,
    fromName,
    replyTo,
    delayMs: Math.max(0, Number(stored?.emailSendDelayMs ?? env("EMAIL_SEND_DELAY_MS") ?? "200") || 200),
    maropostAccountId,
    maropostCampaignName: text(stored?.maropostCampaignName, "MAROPOST_CAMPAIGN_NAME") ?? "aveska-intelligence",
    smtpPasswordSet: Boolean(stored?.smtpPassword?.trim() || env("SMTP_PASSWORD") || env("RESEND_API_KEY")),
    maropostApiKeySet: Boolean(stored?.maropostApiKey?.trim() || env("MAROPOST_API_KEY")),
  };
}

export function mailConfigGaps(stored?: StoredMailSettings | null) {
  const config = getMailConfig(stored);
  const missing: string[] = [];
  if (config.provider === "export") missing.push("provider (choose Resend or SMTP)");
  if (config.provider === "resend") {
    if (!config.fromEmail) missing.push("from email");
    if (!getMailPassword(stored)) missing.push("Resend API key");
    return { config, missing };
  }
  if (!config.host) missing.push("SMTP host");
  if (!config.fromEmail) missing.push("from email");
  if (!getMailPassword(stored)) missing.push("password");
  if (config.provider === "maropost" && !config.maropostAccountId) missing.push("Maropost account ID");
  return { config, missing };
}

export function formatFromHeader(config: MailConfig) {
  if (!config.fromEmail) return config.fromName;
  const safeName = config.fromName.replaceAll('"', "");
  return `"${safeName}" <${config.fromEmail}>`;
}

export const EMPTY_MAIL_SETTINGS = {
  emailProvider: "export",
  smtpHost: null,
  smtpPort: null,
  smtpSecure: false,
  smtpUser: null,
  smtpPassword: null,
  fromEmail: null,
  replyTo: null,
  emailSendDelayMs: 200,
  maropostAccountId: null,
  maropostApiKey: null,
  maropostCampaignName: null,
};
