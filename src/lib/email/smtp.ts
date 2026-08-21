import { promises as dnsPromises, setDefaultResultOrder } from "node:dns";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { EmailProvider } from "@/lib/email/provider";
import { ResendEmailProvider, verifyResend } from "@/lib/email/resend";
import { htmlWithInlineLogo } from "@/lib/email/logo";
import { loadMailSettings } from "@/lib/email/settings-store";
import {
  formatFromHeader,
  getMailConfig,
  getMailPassword,
  getMailProviderName,
  mailConfigGaps,
  runningOnRailway,
  type StoredMailSettings,
} from "@/lib/email/config";

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadStoredMail(): Promise<StoredMailSettings | null> {
  return loadMailSettings();
}

export function explainSmtpError(host: string | null, port: number, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  const target = `${host ?? "mail server"}:${port}`;
  if (lower.includes("enetunreach") || /[0-9a-f]{1,4}:[0-9a-f:]+:[0-9a-f:]+/.test(lower)) {
    return `Could not reach ${target} over IPv6. Gmail gave an IPv6 address this server cannot use. The mailer now connects over IPv4 only — retry the send. (${detail})`;
  }
  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnrefused") ||
    lower.includes("ehostunreach")
  ) {
    return railwaySmtpBlockedMessage(target, detail);
  }
  return `Could not send via ${target}: ${detail}`;
}

export function railwaySmtpBlockedMessage(target = "smtp.gmail.com:587", detail?: string) {
  const extra = detail ? ` (${detail})` : "";
  return `Could not reach ${target}. Gmail SMTP is blocked on Railway Hobby/Trial (ports 25, 465, 587). In Settings, set Provider to Resend, from-address to a mailbox on your verified Resend domain, and paste a Resend API key. Do not use Gmail as the from-address.${extra}`;
}

function assertSmtpAllowedOnThisHost(stored: StoredMailSettings | null) {
  const config = getMailConfig(stored);
  if (!runningOnRailway()) return;
  if (config.provider !== "smtp" && config.provider !== "maropost") return;
  throw new Error(railwaySmtpBlockedMessage(`${config.host ?? "smtp"}:${config.port}`));
}

setDefaultResultOrder("ipv4first");

async function smtpOptions(stored: StoredMailSettings | null): Promise<SMTPTransport.Options> {
  const config = getMailConfig(stored);
  if (!config.configured || !config.host) {
    throw new Error("Email sending is not configured. Add SMTP details under Settings.");
  }
  let host = config.host;
  try {
    const resolved = await dnsPromises.lookup(config.host, { family: 4, all: false });
    host = resolved.address;
  } catch {
    // Keep the hostname if IPv4 lookup fails; connection error handling still applies.
  }
  return {
    host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && (config.port === 587 || config.port === 2525),
    auth: config.user ? { user: config.user, pass: getMailPassword(stored) } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2", servername: config.host },
  };
}

export class SmtpEmailProvider implements EmailProvider {
  name: ReturnType<typeof getMailProviderName> = "smtp";

  constructor(private stored: StoredMailSettings | null = null) {
    this.name = getMailProviderName(stored);
  }

  private extraHeaders(subject: string) {
    const config = getMailConfig(this.stored);
    const headers: Record<string, string> = {};
    if (config.replyTo) {
      headers["List-Unsubscribe"] = `<mailto:${config.replyTo}?subject=unsubscribe>`;
    }
    if (config.provider === "maropost") {
      const apiKey = getMailPassword(this.stored);
      if (!config.maropostAccountId || !apiKey) {
        throw new Error("Maropost sending needs an account ID and API key in Settings.");
      }
      headers["X-AccountID"] = config.maropostAccountId;
      headers["X-ApiKey"] = apiKey;
      headers["X-CampaignName"] = config.maropostCampaignName || "aveska-intelligence";
      headers["X-Subject"] = subject;
    }
    return headers;
  }

  async send(payload: { to: string; subject: string; html: string; from?: string }): Promise<{ id: string }> {
    const stored = this.stored ?? (await loadStoredMail());
    this.stored = stored;
    const config = getMailConfig(stored);
    const outbound = htmlWithInlineLogo(payload.html);
    try {
      const info = await nodemailer.createTransport(await smtpOptions(stored)).sendMail({
        from: payload.from || formatFromHeader(config),
        to: payload.to,
        subject: payload.subject,
        html: outbound.html,
        text: htmlToText(outbound.html),
        attachments: outbound.attachments,
        replyTo: config.replyTo || undefined,
        headers: this.extraHeaders(payload.subject),
      });
      return { id: String(info.messageId || info.response || `smtp-${Date.now()}`) };
    } catch (error) {
      throw new Error(explainSmtpError(config.host, config.port, error));
    }
  }

  async sendBatch(payloads: Array<{ to: string; subject: string; html: string; from?: string }>): Promise<{ ids: string[] }> {
    const ids: string[] = [];
    for (const payload of payloads) {
      const result = await this.send(payload);
      ids.push(result.id);
    }
    return { ids };
  }

  async getCampaignStats(): Promise<Record<string, number>> {
    return { sent: 0, delivered: 0, opened: 0, clicked: 0 };
  }

  async validateEmail(email: string): Promise<boolean> {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async unsubscribe(): Promise<void> {
    return;
  }
}

const disabledProvider: EmailProvider = {
  name: "export",
  async send() {
    throw new Error("Email sending is disabled. Save SMTP or Maropost details under Settings.");
  },
  async sendBatch() {
    throw new Error("Email sending is disabled. Save SMTP or Maropost details under Settings.");
  },
  async getCampaignStats() {
    return { sent: 0, delivered: 0, opened: 0, clicked: 0 };
  },
  async validateEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  async unsubscribe() {
    return;
  },
};

export async function getEmailTransport(): Promise<EmailProvider> {
  const stored = await loadStoredMail();
  const provider = getMailProviderName(stored);
  if (provider === "resend") return new ResendEmailProvider(stored);
  if (provider === "smtp" || provider === "maropost") {
    assertSmtpAllowedOnThisHost(stored);
    return new SmtpEmailProvider(stored);
  }
  return disabledProvider;
}

export async function verifyMailTransport(stored?: StoredMailSettings | null) {
  const settings = stored ?? (await loadStoredMail());
  const { config, missing } = mailConfigGaps(settings);
  if (missing.length) {
    throw new Error(`Missing: ${missing.join(", ")}.`);
  }
  if (config.provider === "resend") {
    return verifyResend(settings);
  }
  assertSmtpAllowedOnThisHost(settings);
  try {
    await nodemailer.createTransport(await smtpOptions(settings)).verify();
  } catch (error) {
    throw new Error(explainSmtpError(config.host, config.port, error));
  }
  return { ok: true, from: formatFromHeader(config), host: `${config.host}:${config.port}` };
}
