import { describe, expect, it } from "vitest";
import { isAllowedTrackingDestination, isPublicTrackingOrigin, wrapEmailHtmlForTracking } from "@/lib/email/tracking";

describe("email click tracking", () => {
  it("does not wrap links through localhost so customers still reach Aveska", () => {
    const html = `<a href="https://www.aveska.com.au/products/seat-belt">View product</a></body>`;
    const wrapped = wrapEmailHtmlForTracking(html, "rec123", "http://localhost:3000");
    expect(wrapped).toBe(html);
    expect(wrapped).not.toContain("/t/rec123");
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
  });
});
