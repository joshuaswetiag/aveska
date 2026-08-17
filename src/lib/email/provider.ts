import type { EmailCopy } from "@/types";
import { AVESKA_RED, resolveEmailLogoSrc } from "@/lib/email/brand";

export { applyTemplate } from "@/lib/email/apply-template";

export interface EmailProvider {
  name: string;
  send(payload: { to: string; subject: string; html: string; from?: string }): Promise<{ id: string }>;
  sendBatch(payloads: Array<{ to: string; subject: string; html: string; from?: string }>): Promise<{ ids: string[] }>;
  getCampaignStats(campaignId: string): Promise<Record<string, number>>;
  validateEmail(email: string): Promise<boolean>;
  unsubscribe(email: string): Promise<void>;
}

export class ExportOnlyEmailProvider implements EmailProvider {
  name = "export";

  async send(): Promise<{ id: string }> {
    throw new Error("Email sending is disabled in V1. Export the campaign instead.");
  }
  async sendBatch(): Promise<{ ids: string[] }> {
    throw new Error("Email sending is disabled in V1. Export the campaign instead.");
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

export function getEmailProvider(): EmailProvider {
  return new ExportOnlyEmailProvider();
}

export function renderEmailHtml(
  copy: Omit<EmailCopy, "html">,
  products: Array<{
    name: string;
    url: string;
    price?: string | null;
    imageUrl?: string | null;
  }>,
  options?: { logoUrl?: string | null },
): string {
  const cards = products
    .map(
      (product) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eeeeee;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;">
            <tr>
              <td width="72" valign="top" style="width:72px;">
                ${
                  product.imageUrl
                    ? `<img src="${product.imageUrl}" alt="" width="64" height="64" style="display:block;width:64px;max-width:64px;height:64px;object-fit:cover;border-radius:6px;background:#f6f6f6;" />`
                    : `<div style="width:64px;height:64px;border-radius:6px;background:#f6f6f6;text-align:center;line-height:64px;color:#555555;font-size:11px;">Aveska</div>`
                }
              </td>
              <td valign="top" style="padding-left:12px;word-break:break-word;overflow-wrap:anywhere;">
                <div style="font-weight:600;color:#1a1a1a;font-size:15px;line-height:1.35;word-break:break-word;overflow-wrap:anywhere;">${product.name}</div>
                ${product.price ? `<div style="color:#555555;font-size:13px;margin-top:4px;">${product.price}</div>` : ""}
                <a href="${product.url}" style="display:inline-block;margin-top:8px;color:${AVESKA_RED};font-size:13px;">View product</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");

  const logoSrc = resolveEmailLogoSrc(options?.logoUrl);
  const shopHref = copy.ctaUrl || "#";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; }
    img { max-width: 100%; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; max-width: 100% !important; }
      .email-pad { padding: 16px !important; }
      .email-header { padding: 16px !important; }
      .email-logo { width: 220px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial, Helvetica, sans-serif;width:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#ffffff;">
    <tr><td align="center" style="padding:16px 8px;">
      <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #eeeeee;border-radius:4px;">
        <tr>
          <td class="email-header" style="background:#ffffff;padding:22px 24px;text-align:center;border-bottom:4px solid ${AVESKA_RED};">
            <a href="${shopHref}" style="display:inline-block;text-decoration:none;">
              <img class="email-logo" src="${logoSrc}" alt="Aveska Auto &amp; Restoration Parts &amp; Accessories" width="280" style="display:block;margin:0 auto;width:280px;max-width:100%;height:auto;border:0;background:#ffffff;" />
            </a>
          </td>
        </tr>
        <tr><td class="email-pad" style="padding:24px;background:#ffffff;word-break:break-word;overflow-wrap:anywhere;">
          <p style="margin:0 0 16px;color:#1a1a1a;font-size:16px;">${copy.greeting}</p>
          <div style="color:#333333;font-size:15px;line-height:1.6;">${copy.body.replaceAll("\n", "<br/>")}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin-top:20px;">${cards}</table>
          <p style="margin:28px 0;">
            <a href="${copy.ctaUrl}" style="background:${AVESKA_RED};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:0;display:inline-block;font-weight:700;letter-spacing:0.04em;">${copy.ctaLabel}</a>
          </p>
          <p style="color:#555555;font-size:13px;line-height:1.5;">${copy.footer.replaceAll("\n", "<br/>")}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
