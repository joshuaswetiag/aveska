function normalizeOrigin(url: string | null | undefined) {
  return url?.trim().replace(/\/$/, "") || "";
}

export function publicAppUrl() {
  return (
    pickTrackingBaseUrl({
      trackingUrl: process.env.TRACKING_URL,
      railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN,
      railwayStaticUrl: process.env.RAILWAY_STATIC_URL,
      authUrl: process.env.AUTH_URL,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      production: process.env.NODE_ENV === "production",
    }) || "http://localhost:3000"
  );
}

export function railwayPublicOrigin() {
  return originFromRailwayDomain(process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL);
}

export function originFromRailwayDomain(domain?: string | null) {
  const host = (domain || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return host ? `https://${host}` : null;
}

export type TrackingUrlSources = {
  stored?: string | null;
  trackingUrl?: string | null;
  railwayPublicDomain?: string | null;
  railwayStaticUrl?: string | null;
  authUrl?: string | null;
  nextAuthUrl?: string | null;
  production?: boolean;
};

/** Prefer a stable public host (Railway) so email clicks work worldwide with the PC off. Never pick trycloudflare. */
export function pickTrackingBaseUrl(sources: TrackingUrlSources): string | null {
  const railway = originFromRailwayDomain(sources.railwayPublicDomain || sources.railwayStaticUrl);
  const candidates = [sources.trackingUrl, railway, sources.authUrl, sources.nextAuthUrl, sources.stored];
  for (const candidate of candidates) {
    const value = normalizeOrigin(candidate);
    if (isStableTrackingOrigin(value)) return value;
  }
  if (sources.production) return null;
  for (const candidate of [sources.authUrl, sources.nextAuthUrl, sources.stored]) {
    const value = normalizeOrigin(candidate);
    if (isLocalTrackingOrigin(value)) return value;
  }
  return null;
}

export function isEphemeralTrackingOrigin(url: string | null | undefined) {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return (
      host.endsWith(".trycloudflare.com") ||
      host.endsWith(".ngrok.io") ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok.app") ||
      host.endsWith(".loca.lt")
    );
  } catch {
    return false;
  }
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

export function isStableTrackingOrigin(url: string | null | undefined) {
  return isPublicTrackingOrigin(url) && !isEphemeralTrackingOrigin(url);
}

export function isLocalTrackingOrigin(url: string | null | undefined) {
  if (!url?.trim()) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function isTrackableOrigin(url: string | null | undefined) {
  return isStableTrackingOrigin(url) || isLocalTrackingOrigin(url) || isEphemeralTrackingOrigin(url);
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
    const parsed = new URL(url.replace(/&amp;/g, "&"));
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

export function unwrapTrackingLinks(html: string) {
  const withoutPixels = html.replace(/<img[^>]*\/t\/[^"'>\s]+\/open[^>]*>/gi, "");
  return withoutPixels.replace(
    /href=(["'])https?:\/\/[^"']+\/t\/[^"'?]+\/?\?u=([^"']+)\1/gi,
    (full, quote: string, encoded: string) => {
      try {
        const dest = decodeURIComponent(encoded.replace(/&amp;/g, "&"));
        if (isAllowedTrackingDestination(dest)) return `href=${quote}${dest}${quote}`;
      } catch {
        return full;
      }
      return full;
    },
  );
}

export function wrapEmailHtmlForTracking(html: string, recipientId: string, baseUrl = publicAppUrl()) {
  const unwrapped = unwrapTrackingLinks(html);
  if (!isStableTrackingOrigin(baseUrl) && !isLocalTrackingOrigin(baseUrl)) return unwrapped;
  const origin = baseUrl.replace(/\/$/, "");
  const withLinks = unwrapped.replace(/href=(["'])(https?:\/\/[^"']+)\1/gi, (full, quote: string, url: string) => {
    const dest = url.replace(/&amp;/g, "&");
    if (dest.includes("/t/") && dest.includes("?u=")) return full;
    if (!isAllowedTrackingDestination(dest)) return full;
    const tracked = `${origin}/t/${encodeURIComponent(recipientId)}?u=${encodeURIComponent(dest)}`;
    return `href=${quote}${tracked}${quote}`;
  });
  const pixel = `<img src="${origin}/t/${encodeURIComponent(recipientId)}/open" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
  if (
    withLinks.includes(`${origin}/t/${recipientId}/open`) ||
    withLinks.includes(`${origin}/t/${encodeURIComponent(recipientId)}/open`)
  ) {
    return withLinks;
  }
  if (/<\/body>/i.test(withLinks)) return withLinks.replace(/<\/body>/i, `${pixel}</body>`);
  return `${withLinks}${pixel}`;
}
