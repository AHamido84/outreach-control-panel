import { describe, expect, it } from "vitest";
import { utcToZonedInput, zonedToUtc } from "@/lib/tz";

describe("company time zone ↔ UTC", () => {
  it("Riyadh (UTC+3, no DST)", () => {
    expect(zonedToUtc("2026-11-22T10:30", "Asia/Riyadh").toISOString()).toBe("2026-11-22T07:30:00.000Z");
    expect(utcToZonedInput(new Date("2026-11-22T07:30:00Z"), "Asia/Riyadh")).toBe("2026-11-22T10:30");
  });
  it("Cairo (summer DST)", () => {
    expect(zonedToUtc("2026-07-01T09:00", "Africa/Cairo").toISOString()).toBe("2026-07-01T06:00:00.000Z");
    expect(zonedToUtc("2026-12-01T09:00", "Africa/Cairo").toISOString()).toBe("2026-12-01T07:00:00.000Z");
  });
  it("round trips", () => {
    for (const tz of ["Asia/Dubai", "Europe/London", "America/New_York", "UTC"]) {
      const d = zonedToUtc("2026-03-29T12:15", tz);
      expect(utcToZonedInput(d, tz)).toBe("2026-03-29T12:15");
    }
  });
});
