import { describe, expect, it } from "vitest";
import { fromCents, toCents } from "@/lib/money";
import { openSecret, sealSecret } from "@/lib/email/secret-box";

describe("money", () => {
  it("round-trips dollars through integer cents", () => {
    expect(toCents(10.1)).toBe(1010);
    expect(toCents("189.005")).toBe(18901);
    expect(toCents("$1,299.00")).toBe(129900);
    expect(toCents("1,299.00")).toBe(129900);
    expect(toCents("POA")).toBeNull();
    expect(toCents("N/A")).toBeNull();
    expect(toCents(" ")).toBeNull();
    expect(toCents("(12.50)")).toBe(-1250);
    expect(toCents("0")).toBe(0);
    expect(fromCents(18900)).toBe(189);
    expect(fromCents(toCents(12.34))).toBe(12.34);
  });
});

describe("mail secrets", () => {
  it("seals a password and opens it back", () => {
    const sealed = sealSecret("smtp-secret");
    expect(sealed?.startsWith("enc:v1:")).toBe(true);
    expect(openSecret(sealed)).toBe("smtp-secret");
    expect(openSecret("already-plain")).toBe("already-plain");
  });
});
