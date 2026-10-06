import { describe, expect, it } from "vitest";
import { addDays, ageOn, dateRange, daysBetween, isDateString, localDate, localParts, zonedToUtc } from "@/lib/time";

describe("time", () => {
  it("按用户时区而不是 UTC 判断日期", () => {
    // UTC 10月5日 23:30 = 上海 10月6日 07:30（早餐不能记到前一天）
    const ts = Date.parse("2026-10-05T23:30:00Z");
    expect(localDate(ts, "Asia/Shanghai")).toBe("2026-10-06");
    expect(localParts(ts, "Asia/Shanghai").time).toBe("07:30");
    expect(localDate(ts, "UTC")).toBe("2026-10-05");
  });

  it("当地时间换算回 UTC", () => {
    expect(zonedToUtc("2026-10-06", "07:30", "Asia/Shanghai")).toBe(Date.parse("2026-10-05T23:30:00Z"));
    // 夏令时地区
    expect(zonedToUtc("2026-07-01", "12:00", "America/New_York")).toBe(Date.parse("2026-07-01T16:00:00Z"));
    expect(zonedToUtc("2026-01-15", "12:00", "America/New_York")).toBe(Date.parse("2026-01-15T17:00:00Z"));
  });

  it("日期运算", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-09-06", "2026-10-06")).toBe(30);
    expect(dateRange("2026-10-04", "2026-10-06")).toEqual(["2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(isDateString("2026-13-01")).toBe(false);
    expect(isDateString("2026-10-06")).toBe(true);
  });

  it("年龄", () => {
    expect(ageOn("1987-03-04", "2026-10-06")).toBe(39);
    expect(ageOn("1987-03-04", "2026-03-03")).toBe(38);
  });
});
