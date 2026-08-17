import { readFileSync } from "fs";
import { join } from "path";
import { AVESKA_LOGO_CID, restyleCampaignHtml } from "@/lib/email/brand";

export {
  AVESKA_LOGO_CID,
  AVESKA_LOGO_URL,
  AVESKA_RED,
  resolveEmailLogoSrc,
  restyleCampaignHtml,
} from "@/lib/email/brand";

let cachedLogoBuffer: Buffer | null = null;

export function aveskaLogoBuffer(): Buffer {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  cachedLogoBuffer = readFileSync(join(process.cwd(), "public", "aveska-logo.png"));
  return cachedLogoBuffer;
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
