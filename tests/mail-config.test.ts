import { describe, expect, it } from "vitest";
import { getMailConfig, getMailPassword, getMailProviderName, mailConfigGaps, parseMailProvider } from "@/lib/email/config";
import { railwaySmtpBlockedMessage } from "@/lib/email/smtp";

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
    const previousKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      expect(mailConfigGaps({ emailProvider: "resend", fromEmail: "hello@aveska.com.au" }).missing).toContain(
        "Resend API key",
      );
    } finally {
      if (previousKey == null) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
    }
  });

  it("parses resend from EMAIL_PROVIDER-style strings", () => {
    expect(parseMailProvider("Resend")).toBe("resend");
    expect(parseMailProvider("smtp")).toBe("smtp");
    expect(parseMailProvider("nope")).toBe("export");
  });

  it("tells Railway Hobby users to switch to Resend instead of waiting on SMTP", () => {
    expect(railwaySmtpBlockedMessage("smtp.gmail.com:587")).toContain("Provider to Resend");
    expect(railwaySmtpBlockedMessage()).toContain("verified Resend domain");
  });

  it("on Railway, EMAIL_PROVIDER=resend wins over saved SMTP", () => {
    const previousEnv = process.env.RAILWAY_ENVIRONMENT;
    const previousProvider = process.env.EMAIL_PROVIDER;
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.EMAIL_PROVIDER = "resend";
    try {
      expect(getMailProviderName({ emailProvider: "smtp" })).toBe("resend");
    } finally {
      if (previousEnv == null) delete process.env.RAILWAY_ENVIRONMENT;
      else process.env.RAILWAY_ENVIRONMENT = previousEnv;
      if (previousProvider == null) delete process.env.EMAIL_PROVIDER;
      else process.env.EMAIL_PROVIDER = previousProvider;
    }
  });

  it("does not use a leftover Gmail password as the Resend API key", () => {
    const previous = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "re_from_env";
    try {
      expect(
        getMailPassword({
          emailProvider: "resend",
          smtpPassword: "gmail-app-password",
        }),
      ).toBe("re_from_env");
    } finally {
      if (previous == null) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous;
    }
  });

  it("keeps Resend from-name Aveska while using a verified test domain", () => {
    const previous = process.env.SMTP_FROM;
    process.env.SMTP_FROM = "hello@domainemarket.com";
    try {
      const config = getMailConfig({
        emailProvider: "resend",
        fromName: "Aveska",
        fromEmail: "someone@gmail.com",
        smtpPassword: "re_test",
      });
      expect(config.fromEmail).toBe("hello@domainemarket.com");
      expect(config.fromName).toBe("Aveska");
    } finally {
      if (previous == null) delete process.env.SMTP_FROM;
      else process.env.SMTP_FROM = previous;
    }
  });
});
