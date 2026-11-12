import { describe, expect, it } from "vitest";
import { openPreviewLinks } from "@/components/email-preview";

describe("email preview links", () => {
  it("opens product links in a new tab so the shop can leave the preview frame", () => {
    const html = `<a href="https://www.aveska.com.au/holden-floor">View product</a><a href="#">Logo</a>`;
    const opened = openPreviewLinks(html);
    expect(opened).toContain('href="https://www.aveska.com.au/holden-floor" target="_blank"');
    expect(opened).toContain('href="#"');
    expect(opened.match(/target="_blank"/g)?.length).toBe(1);
  });
});
