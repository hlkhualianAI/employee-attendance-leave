import { describe, expect, it } from "vitest";
import { calculateLateMinutes, countWeekdays, getBangkokMinutes } from "./attendance.logic";

describe("attendance business rules", () => {
  it("uses Bangkok local time when calculating lateness", () => {
    const onTime = Date.parse("2026-09-19T09:00:00+07:00");
    const late = Date.parse("2026-09-19T09:17:00+07:00");

    expect(getBangkokMinutes(onTime)).toBe(540);
    expect(calculateLateMinutes(onTime, 540)).toBe(0);
    expect(calculateLateMinutes(late, 540)).toBe(17);
  });

  it("counts weekdays only for leave duration", () => {
    expect(countWeekdays("2026-09-14", "2026-09-18")).toBe(5);
    expect(countWeekdays("2026-09-18", "2026-09-21")).toBe(2);
    expect(countWeekdays("2026-09-19", "2026-09-20")).toBe(0);
    expect(countWeekdays("2026-09-21", "2026-09-18")).toBe(0);
  });
});
