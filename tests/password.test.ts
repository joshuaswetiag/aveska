import { hashPassword, passwordMatches } from "@/lib/password";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("password", () => {
  it("accepts a new salted hash and rejects a different password", () => {
    const stored = hashPassword("correct-horse");
    expect(stored.startsWith("pbkdf2:")).toBe(true);
    expect(passwordMatches("correct-horse", stored)).toBe(true);
    expect(passwordMatches("wrong", stored)).toBe(false);
  });

  it("still accepts the unsalted hash stored on the test database", () => {
    const stored = `sha256:${createHash("sha256").update("correct-horse").digest("hex")}`;
    expect(passwordMatches("correct-horse", stored)).toBe(true);
    expect(passwordMatches("change-me", stored)).toBe(false);
  });
});
