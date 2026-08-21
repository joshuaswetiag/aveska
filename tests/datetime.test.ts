import { describe, expect, it } from "vitest";
import { parseNetoDateTime, toNetoUtcStamp, zonedDayRange } from "@/lib/utils";

describe("Neto datetimes and Sydney calendar days", () => {
  it("treats naive Neto timestamps as UTC", () => {
    const date = parseNetoDateTime("2026-08-16 17:02:05");
    expect(date?.toISOString()).toBe("2026-08-16T17:02:05.000Z");
  });

  it("includes early-morning Sydney orders on the store calendar day", () => {
    const { start, end } = zonedDayRange("2026-08-17");
    expect(start.toISOString()).toBe("2026-08-16T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-17T14:00:00.000Z");
    const earlyMorning = parseNetoDateTime("2026-08-16 16:02:05")!;
    expect(earlyMorning.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(earlyMorning.getTime()).toBeLessThan(end.getTime());
  });

  it("keeps the previous evening in the previous Sydney day", () => {
    const { start } = zonedDayRange("2026-08-17");
    const previousEvening = parseNetoDateTime("2026-08-16 13:00:00")!;
    expect(previousEvening.getTime()).toBeLessThan(start.getTime());
  });

  it("keeps late-afternoon Sydney orders on the same store day", () => {
    const { start, end } = zonedDayRange("2026-08-18");
    const afternoon = parseNetoDateTime("2026-08-18 06:30:00")!;
    expect(afternoon.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(afternoon.getTime()).toBeLessThan(end.getTime());
  });

  it("formats Neto filter stamps in UTC without a timezone suffix", () => {
    const { start, end } = zonedDayRange("2026-08-18");
    expect(toNetoUtcStamp(start)).toBe("2026-08-17 14:00:00");
    expect(toNetoUtcStamp(new Date(end.getTime() - 1000))).toBe("2026-08-18 13:59:59");
  });
});
