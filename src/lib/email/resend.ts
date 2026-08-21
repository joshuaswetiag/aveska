import type { EmailProvider } from "@/lib/email/provider";
import { htmlWithInlineLogo } from "@/lib/email/logo";
import {
  formatFromHeader,
  getMailConfig,
  getMailPassword,
  type StoredMailSettings,
} from "@/lib/email/config";

const RESEND_API = "https://api.resend.com";

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertResendFrom(fromEmail: string | null) {
  const value = (fromEmail ?? "").toLowerCase();
  if (value.endsWith("@gmail.com") || value.endsWith("@googlemail.com")) {
    throw new Error(
      "Resend cannot send from a Gmail address. Use an address on a domain you verified in Resend, such as hello@aveska.com.au.",
    );
  }
}

async function resendRequest(apiKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!response.ok) {
    throw new Error(body.message || `Resend HTTP ${response.status}`);
  }
  return body;
}

export async function verifyResend(stored: StoredMailSettings | null) {
  const config = getMailConfig(stored);
  const apiKey = getMailPassword(stored);
  if (!apiKey) throw new Error("Missing Resend API key.");
  if (!config.fromEmail) throw new Error("Missing from email.");
  assertResendFrom(config.fromEmail);
  await resendRequest(apiKey, "/domains");
  return { ok: true, from: formatFromHeader(config), host: "Resend HTTPS" };
}

export class ResendEmailProvider implements EmailProvider {
  name = "resend" as const;

  constructor(private stored: StoredMailSettings | null = null) {}

  async send(payload: { to: string; subject: string; html: string; from?: string }): Promise<{ id: string }> {
    const config = getMailConfig(this.stored);
    const apiKey = getMailPassword(this.stored);
    if (!apiKey) throw new Error("Missing Resend API key.");
    assertResendFrom(config.fromEmail);
    const outbound = htmlWithInlineLogo(payload.html);
    const logo = outbound.attachments[0];
    const result = await resendRequest(apiKey, "/emails", {
      method: "POST",
      body: JSON.stringify({
        from: payload.from || formatFromHeader(config),
        to: [payload.to],
        subject: payload.subject,
        html: outbound.html,
        text: htmlToText(outbound.html),
        reply_to: config.replyTo || undefined,
        attachments: logo
          ? [
              {
                filename: logo.filename,
                content: Buffer.isBuffer(logo.content) ? logo.content.toString("base64") : String(logo.content),
                content_type: logo.contentType,
                content_id: logo.cid,
              },
            ]
          : undefined,
      }),
    });
    return { id: result.id || `resend-${Date.now()}` };
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
