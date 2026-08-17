import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { verifyMailTransport } from "@/lib/email/smtp";
import { loadMailSettings } from "@/lib/email/settings-store";
import { parseMailProvider, type StoredMailSettings } from "@/lib/email/config";

function asText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const saved = await loadMailSettings();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const draft: StoredMailSettings = {
      emailProvider: parseMailProvider(String(body.emailProvider ?? saved?.emailProvider ?? "smtp")),
      fromName: asText(body.fromName) ?? saved?.fromName,
      fromEmail: asText(body.fromEmail) ?? saved?.fromEmail,
      replyTo: asText(body.replyTo) ?? saved?.replyTo,
      smtpHost: asText(body.smtpHost) ?? saved?.smtpHost,
      smtpPort: body.smtpPort != null && String(body.smtpPort) !== "" ? Number(body.smtpPort) : saved?.smtpPort,
      smtpSecure: body.smtpSecure == null ? saved?.smtpSecure : Boolean(body.smtpSecure),
      smtpUser: asText(body.smtpUser) ?? saved?.smtpUser,
      smtpPassword: asText(body.smtpPassword) ?? saved?.smtpPassword,
      maropostAccountId: asText(body.maropostAccountId) ?? saved?.maropostAccountId,
      maropostApiKey: asText(body.maropostApiKey) ?? saved?.maropostApiKey,
      maropostCampaignName: asText(body.maropostCampaignName) ?? saved?.maropostCampaignName,
    };
    const result = await verifyMailTransport(draft);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not connect";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
