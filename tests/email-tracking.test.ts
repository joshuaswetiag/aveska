import { describe, expect, it } from "vitest";
import {
  isAllowedTrackingDestination,
  isEphemeralTrackingOrigin,
  isPublicTrackingOrigin,
  isStableTrackingOrigin,
  pickTrackingBaseUrl,
  wrapEmailHtmlForTracking,
} from "@/lib/email/tracking";

describe("email click tracking", () => {
  it("wraps Aveska product links through localhost so local Traffic can record clicks", () => {
    const html = `<a href="https://www.aveska.com.au/products/seat-belt">View product</a></body>`;
    const wrapped = wrapEmailHtmlForTracking(html, "rec123", "http://localhost:3000");
    expect(wrapped).toContain("http://localhost:3000/t/rec123?u=");
    expect(wrapped).toContain("/t/rec123/open");
  });

  it("wraps Aveska product links when the app has a public https URL", () => {
    const html = `<a href="https://www.aveska.com.au/products/seat-belt">View product</a></body>`;
    const wrapped = wrapEmailHtmlForTracking(html, "rec123", "https://mail.aveska.com.au");
    expect(wrapped).toContain("https://mail.aveska.com.au/t/rec123?u=");
    expect(wrapped).toContain(encodeURIComponent("https://www.aveska.com.au/products/seat-belt"));
    expect(wrapped).toContain("/t/rec123/open");
  });

  it("rejects open-redirect hosts and private tracking origins", () => {
    expect(isAllowedTrackingDestination("https://evil.example/phish")).toBe(false);
    expect(isAllowedTrackingDestination("https://www.aveska.com.au/p")).toBe(true);
    expect(isPublicTrackingOrigin("http://localhost:3000")).toBe(false);
    expect(isPublicTrackingOrigin("https://clicks.aveska.com.au")).toBe(true);
    expect(isEphemeralTrackingOrigin("https://disclaimers-rising-magic-delivery.trycloudflare.com")).toBe(true);
    expect(isStableTrackingOrigin("https://disclaimers-rising-magic-delivery.trycloudflare.com")).toBe(false);
    expect(isStableTrackingOrigin("https://aveska-production.up.railway.app")).toBe(true);
  });

  it("does not wrap through trycloudflare and unwraps stale tunnel links", () => {
    const html = `<a href="https://old-name.trycloudflare.com/t/rec123?u=${encodeURIComponent("https://www.aveska.com.au/products/seat-belt")}">View product</a></body>`;
    const unwrapped = wrapEmailHtmlForTracking(html, "rec123", "https://old-name.trycloudflare.com");
    expect(unwrapped).toContain('href="https://www.aveska.com.au/products/seat-belt"');
    expect(unwrapped).not.toContain("trycloudflare.com");
  });

  it("replaces stale tunnel links with the Railway tracking URL", () => {
    const html = `<a href="https://old-name.trycloudflare.com/t/rec123?u=${encodeURIComponent("https://www.aveska.com.au/products/seat-belt")}">View product</a></body>`;
    const wrapped = wrapEmailHtmlForTracking(html, "rec123", "https://aveska-production.up.railway.app");
    expect(wrapped).toContain("https://aveska-production.up.railway.app/t/rec123?u=");
    expect(wrapped).not.toContain("trycloudflare.com");
  });

  it("prefers Railway over a saved Cloudflare tunnel", () => {
    expect(
      pickTrackingBaseUrl({
        stored: "https://higher-motherboard-int-finally.trycloudflare.com",
        railwayPublicDomain: "aveska-production.up.railway.app",
        authUrl: "http://localhost:3000",
        production: true,
      }),
    ).toBe("https://aveska-production.up.railway.app");
  });
});
