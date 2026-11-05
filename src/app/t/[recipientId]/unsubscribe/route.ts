import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/utils";

export async function GET(_: Request, { params }: { params: Promise<{ recipientId: string }> }) {
  const { recipientId } = await params;
  const id = decodeURIComponent(recipientId);
  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id },
    select: { customer: { select: { id: true, email: true, emailNormalized: true } } },
  });
  const email = recipient?.customer.emailNormalized || normalizeEmail(recipient?.customer.email);
  if (email && recipient?.customer) {
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
  }
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:40px"><h1>You are unsubscribed</h1><p>You will not receive further Aveska campaign emails at this address.</p></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
