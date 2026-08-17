import { describe, expect, it } from "vitest";
import { eligibleRecipients } from "@/lib/campaign/send-targets";

const rows = [
  { id: "a", email: "john@example.com", emailNormalized: "john@example.com", isSuppressed: false, sent: false },
  { id: "b", email: "skip@example.com", emailNormalized: "skip@example.com", isSuppressed: true, sent: false },
  { id: "c", email: null, emailNormalized: null, isSuppressed: false, sent: false },
  { id: "d", email: "done@example.com", emailNormalized: "done@example.com", isSuppressed: false, sent: true },
  { id: "e", email: "list@example.com", emailNormalized: "list@example.com", isSuppressed: false, sent: false },
];

describe("campaign bulk send targeting", () => {
  it("skips suppressed, missing email, and already-sent recipients", () => {
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
});
