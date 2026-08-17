import "server-only";

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { EmailProvider } from "@/lib/email/provider";
import { htmlWithInlineLogo } from "@/lib/email/logo";
import { loadMailSettings } from "@/lib/email/settings-store";
import {
  formatFromHeader,
  getMailConfig,
  getMailPassword,
  getMailProviderName,
  mailConfigGaps,
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

function smtpOptions(stored: StoredMailSettings | null): SMTPTransport.Options {
  const config = getMailConfig(stored);
  if (!config.configured || !config.host) {
    throw new Error("Email sending is not configured. Add SMTP details under Settings.");
  }
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: getMailPassword(stored) } : undefined,
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
    const info = await nodemailer.createTransport(smtpOptions(stored)).sendMail({
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
  if (provider === "smtp" || provider === "maropost") return new SmtpEmailProvider(stored);
  return disabledProvider;
}

export async function verifyMailTransport(stored?: StoredMailSettings | null) {
  const settings = stored ?? (await loadStoredMail());
  const { config, missing } = mailConfigGaps(settings);
  if (missing.length) {
    throw new Error(`Missing: ${missing.join(", ")}.`);
  }
  await nodemailer.createTransport(smtpOptions(settings)).verify();
  return { ok: true, from: formatFromHeader(config), host: `${config.host}:${config.port}` };
}
