import { describe, expect, it } from "vitest";
import { getMailConfig, mailConfigGaps, parseMailProvider } from "@/lib/email/config";

describe("mail provider config", () => {
  it("treats resend as configured with from-address and API key only", () => {
    const config = getMailConfig({
      emailProvider: "resend",
      fromEmail: "hello@aveska.com.au",
      smtpPassword: "re_test",
    });
    expect(config.provider).toBe("resend");
    expect(config.configured).toBe(true);
    expect(config.host).toBe("api.resend.com");
    expect(mailConfigGaps({ emailProvider: "resend", fromEmail: "hello@aveska.com.au" }).missing).toContain(
      "Resend API key",
    );
  });

  it("parses resend from EMAIL_PROVIDER-style strings", () => {
    expect(parseMailProvider("Resend")).toBe("resend");
    expect(parseMailProvider("smtp")).toBe("smtp");
    expect(parseMailProvider("nope")).toBe("export");
  });
});
