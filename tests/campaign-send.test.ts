import { describe, expect, it } from "vitest";
import { eligibleRecipients, isEbayMemberEmail } from "@/lib/campaign/send-targets";

const rows = [
  { id: "a", email: "john@example.com", emailNormalized: "john@example.com", isSuppressed: false, sent: false },
  { id: "b", email: "skip@example.com", emailNormalized: "skip@example.com", isSuppressed: true, sent: false },
  { id: "c", email: null, emailNormalized: null, isSuppressed: false, sent: false },
  { id: "d", email: "done@example.com", emailNormalized: "done@example.com", isSuppressed: false, sent: true },
  { id: "e", email: "list@example.com", emailNormalized: "list@example.com", isSuppressed: false, sent: false },
  {
    id: "f",
    email: "0090f3f3e3c6bb0608cd@members.ebay.com",
    emailNormalized: "0090f3f3e3c6bb0608cd@members.ebay.com",
    isSuppressed: false,
    sent: false,
  },
];

describe("campaign bulk send targeting", () => {
  it("skips suppressed, missing email, already-sent, and eBay member addresses", () => {
    const eligible = eligibleRecipients(rows, new Set(["list@example.com"]));
    expect(eligible.map((row) => row.id)).toEqual(["a"]);
  });

  it("can target a single remaining recipient", () => {
    const eligible = eligibleRecipients(rows, new Set(), { recipientId: "a" });
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe("a");
  });

  it("does not re-send a selected recipient who already went out", () => {
    expect(eligibleRecipients(rows, new Set(), { recipientId: "d" })).toHaveLength(0);
  });

  it("never sends to eBay masked member emails even when selected alone", () => {
    expect(isEbayMemberEmail("0090f29e2cad9d8e0079@members.ebay.com")).toBe(true);
    expect(isEbayMemberEmail("brewsterliam1@gmail.com")).toBe(false);
    expect(eligibleRecipients(rows, new Set(), { recipientId: "f" })).toHaveLength(0);
  });
});
