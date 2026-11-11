import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";
import { unsignedUnsubscribeStillValid, validUnsubscribeToken } from "@/lib/campaign/unsubscribe-token";

function page(title: string, body: string) {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;max-width:520px"><h1>${title}</h1><p>${body}</p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

function tokenFrom(request: Request) {
  return new URL(request.url).searchParams.get("t");
}

async function linkAllowed(recipientId: string, token: string | null) {
  if (validUnsubscribeToken(recipientId, token)) return true;
  if (token) return false;
  const row = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { sent: true, sentAt: true },
  });
  return Boolean(row?.sent && unsignedUnsubscribeStillValid(row.sentAt));
}

async function unsubscribe(recipientId: string) {
  if (recipientId === "test") return;
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { customer: { select: { id: true, email: true, emailNormalized: true } } },
  });
  const email = recipient?.customer.emailNormalized || normalizeEmail(recipient?.customer.email);
  if (!email || !recipient?.customer) return;
  await prisma.suppression.upsert({
    where: { emailNormalized_reason: { emailNormalized: email, reason: "UNSUBSCRIBED" } },
    update: {},
    create: {
      email: recipient.customer.email || email,
      emailNormalized: email,
      reason: "UNSUBSCRIBED",
      source: "email-link",
    },
  });
  await prisma.customer.update({
    where: { id: recipient.customer.id },
    data: { isSuppressed: true },
  });
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { unsubscribed: true },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;
  const id = decodeURIComponent(recipientId);
  if (id === "test") {
    return page("Test email", "This is a test message. Nobody was unsubscribed.");
  }
  const token = tokenFrom(request);
  if (!(await linkAllowed(id, token))) {
    return page("Link expired", "This unsubscribe link is not valid.");
  }
  const action = new URL(request.url).pathname + new URL(request.url).search;
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px;max-width:520px"><h1>Unsubscribe</h1><p>Confirm that you do not want further Aveska campaign emails.</p><form method="post" action="${action}"><button type="submit" style="margin-top:16px;padding:10px 16px">Unsubscribe</button></form></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;
  const id = decodeURIComponent(recipientId);
  if (id === "test") return page("Test email", "This is a test message. Nobody was unsubscribed.");
  if (!(await linkAllowed(id, tokenFrom(request)))) {
    return page("Link expired", "This unsubscribe link is not valid.");
  }
  await unsubscribe(id);
  return page("You are unsubscribed", "You will not receive further Aveska campaign emails at this address.");
}
