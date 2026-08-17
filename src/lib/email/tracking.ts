export function publicAppUrl() {
  const value =
    process.env.TRACKING_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return value.replace(/\/$/, "");
}

export function isPublicTrackingOrigin(url: string | null | undefined) {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export function trackingLinkLabel(url: string) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (!last || last === "/") return parsed.hostname.replace(/^www\./, "");
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return "Link";
  }
}

export function isAllowedTrackingDestination(url: string, extraHosts: string[] = []) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    const allowed = new Set(
      ["aveska.com.au", "www.aveska.com.au", ...extraHosts.map((item) => item.toLowerCase().replace(/^https?:\/\//, "").split("/")[0])].filter(
        Boolean,
      ),
    );
    return allowed.has(host);
  } catch {
    return false;
  }
}

export function wrapEmailHtmlForTracking(html: string, recipientId: string, baseUrl = publicAppUrl()) {
  if (!isPublicTrackingOrigin(baseUrl)) return html;
  const origin = baseUrl.replace(/\/$/, "");
  const withLinks = html.replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, (full, quote: string, url: string) => {
    if (url.includes(`${origin}/t/`)) return full;
    if (!isAllowedTrackingDestination(url)) return full;
    const tracked = `${origin}/t/${encodeURIComponent(recipientId)}?u=${encodeURIComponent(url)}`;
    return `href=${quote}${tracked}${quote}`;
  });
  const pixel = `<img src="${origin}/t/${encodeURIComponent(recipientId)}/open" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  if (withLinks.includes(`/t/${recipientId}/open`)) return withLinks;
  if (/<\/body>/i.test(withLinks)) return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  return `${withLinks}${pixel}`;
}
