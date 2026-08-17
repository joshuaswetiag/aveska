import { describe, expect, it } from "vitest";
import { isFullSyncJob } from "@/lib/catalogue/full-sync";

describe("full Aveska store sync", () => {
  it("recognises a full store sync job", () => {
    expect(isFullSyncJob({ kind: "full", from: "2016-01-01" })).toBe(true);
    expect(isFullSyncJob({ kind: "orders" })).toBe(false);
    expect(isFullSyncJob(null)).toBe(false);
  });
});
