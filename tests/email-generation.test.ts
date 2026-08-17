import { describe, expect, it } from "vitest";
import { applyTemplate, renderEmailHtml } from "@/lib/email/provider";
import { buildVariables } from "@/lib/ai/provider";
import { TemplateAiProvider } from "@/lib/ai/provider";

describe("email generation", () => {
  it("replaces template variables without leaking extra PII", () => {
    const vars = buildVariables({
      name: "John Smith",
      vehicle: "Ford Falcon XB/XC Sedan",
      make: "Ford",
      series: "XB/XC",
      purchasedProduct: "Seat Belts",
      products: [{ name: "Rear Quarter", url: "https://example.com/p", price: "$245.00" }],
      shopUrl: "https://aveska.com.au",
    });
    expect(vars.first_name).toBe("John");
    expect(applyTemplate("Hi {{first_name}} — {{vehicle}}", vars)).toBe("Hi John — Ford Falcon XB/XC Sedan");
    expect(JSON.stringify(vars)).not.toMatch(/last Tuesday/i);
  });

  it("uses restoration language without discount claims", async () => {
    const copy = await new TemplateAiProvider().generateEmailCopy({
      firstName: "John",
      vehicle: "Ford Falcon XB/XC Sedan",
      make: "Ford",
      series: "XB/XC",
      purchasedProduct: "Seat Belts",
      products: [{ name: "Ford XB/XC Rear Quarter Repair Panel" }],
      campaignType: "CROSS_SELL",
    });
    expect(copy.subject.toLowerCase()).toContain("xb");
    expect(copy.subject.toLowerCase()).toContain("ford falcon");
    expect(copy.subject.toLowerCase()).not.toMatch(/^more /);
    expect(copy.subject.toLowerCase()).not.toContain("for your project");
    expect(copy.ctaLabel.toLowerCase()).toContain("view");
    expect(copy.body.toLowerCase()).toContain("selected");
    expect(copy.body.toLowerCase()).not.toContain("free shipping");
    expect(copy.body.toLowerCase()).not.toContain("discount");
    expect(copy.body.toLowerCase()).not.toContain("last tuesday");
  });

  it("renders a fluid email that can shrink below 600px", () => {
    const html = renderEmailHtml(
      {
        subject: "Parts",
        preheader: "More parts",
        greeting: "Hi John,",
        body: "Thanks for choosing Aveska for your Holden Kingswood EJ/EH.",
        ctaLabel: "Shop for EJ/EH",
        ctaUrl: "https://www.aveska.com.au",
        footer: "Aveska",
      },
      [
        {
          name: "Front Fender Upper Rust Panels suits Holden Kingswood EJ/EH",
          url: "https://www.aveska.com.au/p",
          price: "$118.00",
          imageUrl: "https://example.com/p.jpg",
        },
      ],
    );
    expect(html).toContain('name="viewport"');
    expect(html).toContain("max-width:600px");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain('alt="Aveska Auto &amp; Restoration Parts &amp; Accessories"');
    expect(html).toContain("https://www.aveska.com.au/assets/website_logo.png");
    expect(html).toContain("background:#ffffff");
    expect(html).toContain("background:#BC2213");
    expect(html).not.toContain("data:image/png;base64,");
    expect(html).not.toContain("background:#000000");
  });

  it("restyles stored emails onto the white Aveska template", async () => {
    const { restyleCampaignHtml, htmlWithInlineLogo, AVESKA_LOGO_URL, AVESKA_RED } = await import("@/lib/email/logo");
    const oldHtml = `<img class="email-logo" src="data:image/png;base64,abc" /><a style="background:#9a3412">Shop</a><td style="background:#000000">`;
    const restyled = restyleCampaignHtml(oldHtml);
    expect(restyled).toContain(AVESKA_LOGO_URL);
    expect(restyled).toContain(AVESKA_RED);
    expect(restyled).toContain("background:#ffffff");
    expect(restyled).not.toContain("data:image/png");
    const outbound = htmlWithInlineLogo(oldHtml);
    expect(outbound.html).toContain('src="cid:aveska-logo"');
    expect(outbound.attachments[0]?.cid).toBe("aveska-logo");
  });

  it("writes a professional vehicle-specific subject", async () => {
    const { professionalSubject } = await import("@/lib/email/copy");
    expect(
      professionalSubject({
        firstName: "John",
        vehicle: "Holden Kingswood EJ/EH",
        make: "Holden",
        series: "EJ/EH",
        purchasedProduct: "Seat Belts",
        campaignType: "CROSS_SELL",
      }),
    ).toBe("Selected parts for your Holden Kingswood EJ/EH");
  });
});
