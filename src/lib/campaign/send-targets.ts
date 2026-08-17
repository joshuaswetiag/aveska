import { normalizeEmail } from "@/lib/utils";

export type SendCandidate = {
  id: string;
  email: string | null;
  emailNormalized?: string | null;
  isSuppressed?: boolean;
  sent: boolean;
  bodyHtml?: string | null;
  subject?: string | null;
};

export function eligibleRecipients(
  rows: SendCandidate[],
  suppressed: Set<string>,
  opts?: { recipientId?: string },
) {
  return rows.filter((row) => {
    if (opts?.recipientId && row.id !== opts.recipientId) return false;
    if (row.sent) return false;
    if (row.isSuppressed) return false;
    const email = row.emailNormalized ?? normalizeEmail(row.email);
    if (!email) return false;
    if (suppressed.has(email)) return false;
    return true;
  });
}
