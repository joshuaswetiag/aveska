import { readFileSync } from "fs";
import { join } from "path";

/** Live store logo — Gmail strips data: URIs, so emails must use https or cid. */
export const AVESKA_LOGO_URL = "https://www.aveska.com.au/assets/website_logo.png";
/** BUY NOW red from aveska.com.au (`rgb(188, 34, 19)`). */
export const AVESKA_RED = "#BC2213";
export const AVESKA_LOGO_CID = "aveska-logo";

let cachedLogoBuffer: Buffer | null = null;

export function aveskaLogoBuffer(): Buffer {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  cachedLogoBuffer = readFileSync(join(process.cwd(), "public", "aveska-logo.png"));
  return cachedLogoBuffer;
}

export function resolveEmailLogoSrc(logoUrl?: string | null): string {
  if (logoUrl && /^https?:\/\//i.test(logoUrl)) return logoUrl;
  return AVESKA_LOGO_URL;
}

export function restyleCampaignHtml(html: string): string {
  return html
    .replace(/background:#000000/gi, "background:#ffffff")
    .replace(/background:#f6f3ee/gi, "background:#ffffff")
    .replace(/#9a3412/gi, AVESKA_RED)
    .replace(/#ece7e1/gi, "#eeeeee")
    .replace(/#f4f1ec/gi, "#f6f6f6")
    .replace(/#1f1b16/gi, "#1a1a1a")
    .replace(/#3f3a34/gi, "#333333")
    .replace(/#6b6258/gi, "#555555")
    .replace(/Georgia,\s*'Times New Roman',\s*serif/gi, "Arial, Helvetica, sans-serif")
    .replace(/src="data:image\/[^"]+"/gi, `src="${AVESKA_LOGO_URL}"`)
    .replace(/src='data:image\/[^']+'/gi, `src="${AVESKA_LOGO_URL}"`);
}

export function logoInlineAttachment() {
  return {
    filename: "aveska-logo.png",
    content: aveskaLogoBuffer(),
    cid: AVESKA_LOGO_CID,
    contentType: "image/png",
    contentDisposition: "inline" as const,
  };
}

export function htmlWithInlineLogo(html: string) {
  const restyled = restyleCampaignHtml(html);
  const withCid = restyled
    .replace(/(<img[^>]*class="email-logo"[^>]*src=")[^"]+"/gi, `$1cid:${AVESKA_LOGO_CID}"`)
    .replace(/(<img[^>]*src=")[^"]+("[^>]*class="email-logo")/gi, `$1cid:${AVESKA_LOGO_CID}$2`);
  return { html: withCid, attachments: [logoInlineAttachment()] };
}
