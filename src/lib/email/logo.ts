import { readFileSync } from "fs";
import { join } from "path";
import { AVESKA_LOGO_CID, AVESKA_LOGO_URL, restyleCampaignHtml } from "@/lib/email/brand";

export {
  AVESKA_LOGO_CID,
  AVESKA_LOGO_URL,
  AVESKA_RED,
  resolveEmailLogoSrc,
  restyleCampaignHtml,
} from "@/lib/email/brand";

let cachedLogoBuffer: Buffer | null | undefined;

function readLogoFile(): Buffer | null {
  if (cachedLogoBuffer !== undefined) return cachedLogoBuffer;
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.AVESKA_RUNTIME === "worker") {
    cachedLogoBuffer = null;
    return null;
  }
  try {
    cachedLogoBuffer = readFileSync(join(process.cwd(), "public", "aveska-logo.png"));
  } catch {
    cachedLogoBuffer = null;
  }
  return cachedLogoBuffer;
}

export function aveskaLogoBuffer(): Buffer {
  const buffer = readLogoFile();
  if (!buffer) throw new Error("Aveska logo file is not available on this server.");
  return buffer;
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
  const buffer = readLogoFile();
  if (!buffer) {
    return {
      html: restyled.replaceAll(`cid:${AVESKA_LOGO_CID}`, AVESKA_LOGO_URL),
      attachments: [],
    };
  }
  const withCid = restyled
    .replace(/(<img[^>]*class="email-logo"[^>]*src=")[^"]+"/gi, `$1cid:${AVESKA_LOGO_CID}"`)
    .replace(/(<img[^>]*src=")[^"]+("[^>]*class="email-logo")/gi, `$1cid:${AVESKA_LOGO_CID}$2`);
  return { html: withCid, attachments: [logoInlineAttachment()] };
}
