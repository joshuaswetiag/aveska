import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { audit } from "@/lib/audit";
import { EMPTY_MAIL_SETTINGS, parseMailProvider } from "@/lib/email/config";
import { loadMailSettings, saveMailSettings } from "@/lib/email/settings-store";

function asText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function asInt(value: unknown, fallback: number) {
  if (value == null || String(value).trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const current = await loadMailSettings();

    if (body.action === "clear") {
      await saveMailSettings({
        emailProvider: EMPTY_MAIL_SETTINGS.emailProvider,
        fromName: current?.fromName?.trim() || "Aveska",
        fromEmail: null,
        replyTo: null,
        smtpHost: null,
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: null,
        smtpPassword: null,
        emailSendDelayMs: 200,
        maropostAccountId: null,
        maropostApiKey: null,
        maropostCampaignName: null,
      });
      await audit({ userId: session.user.id, action: "settings_mail_clear", entityType: "Settings", entityId: "default" });
      return NextResponse.json({ ok: true, emailProvider: "export", smtpPasswordSet: false, maropostApiKeySet: false });
    }

    const provider = parseMailProvider(String(body.emailProvider ?? "export"));
    const smtpPassword = asText(body.smtpPassword) ?? current?.smtpPassword ?? null;
    const maropostApiKey = asText(body.maropostApiKey) ?? current?.maropostApiKey ?? null;

    await saveMailSettings({
      emailProvider: provider,
      fromName: asText(body.fromName) || "Aveska",
      fromEmail: asText(body.fromEmail),
      replyTo: asText(body.replyTo),
      smtpHost: asText(body.smtpHost),
      smtpPort: asInt(body.smtpPort, 587),
      smtpSecure: Boolean(body.smtpSecure),
      smtpUser: asText(body.smtpUser),
      smtpPassword,
      emailSendDelayMs: Math.max(0, asInt(body.emailSendDelayMs, 200)),
      maropostAccountId: asText(body.maropostAccountId),
      maropostApiKey,
      maropostCampaignName: asText(body.maropostCampaignName) || "aveska-intelligence",
    });

    await audit({ userId: session.user.id, action: "settings_mail_update", entityType: "Settings", entityId: "default" });
    return NextResponse.json({
      ok: true,
      emailProvider: provider,
      smtpPasswordSet: Boolean(smtpPassword),
      maropostApiKeySet: Boolean(maropostApiKey),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save SMTP settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
