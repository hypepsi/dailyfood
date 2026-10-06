import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { dayBurn, deficitTier, fatGrams, loggingStreak } from "@/lib/energy";
import { addDays } from "@/lib/time";
import { clearActivity, setActivity } from "@/services/activity";
import { createManualMeal } from "@/services/meals";
import { addMetric } from "@/services/metrics";
import { getDeficitSummary } from "@/services/snapshot";

const energy = { bmr: 1789, bmrSource: "实测" as const, tdee: 2460 };

describe("每日消耗", () => {
  it("没有手表数据时按活动水平估算", () => {
    expect(dayBurn(energy, null)).toEqual({ burn: 2460, bmr: 1789, active: 671, source: "estimate" });
  });
  it("活动消耗要加上基础代谢；全天总消耗不再加", () => {
    expect(dayBurn(energy, { kcal: 1086, kind: "active" })).toMatchObject({ burn: 2875, active: 1086, source: "watch" });
    expect(dayBurn(energy, { kcal: 2700, kind: "total" })).toMatchObject({ burn: 2700, active: 911, source: "watch" });
  });
  it("全天总消耗低于基础代谢（一天没过完）时按基础代谢算", () => {
    expect(dayBurn(energy, { kcal: 900, kind: "total" }).burn).toBe(1789);
  });
});

describe("档位与换算", () => {
  it("档位边界", () => {
    expect([-300, 0, 200, 500, 900, 1500].map((d) => deficitTier(d).key)).toEqual(["surplus", "even", "small", "steady", "strong", "too_much"]);
  });
  it("7700 kcal ≈ 1 kg 脂肪", () => {
    expect(fatGrams(770)).toBe(100);
    expect(fatGrams(-385)).toBe(-50);
  });
  it("连续记录天数：今天还没记时从昨天算起", () => {
    const prev = (d: string) => addDays(d, -1);
    expect(loggingStreak(new Set(["2026-10-04", "2026-10-05"]), "2026-10-06", prev)).toBe(2);
    expect(loggingStreak(new Set(["2026-10-03", "2026-10-05", "2026-10-06"]), "2026-10-06", prev)).toBe(2);
    expect(loggingStreak(new Set(["2026-10-01"]), "2026-10-06", prev)).toBe(0);
  });
});

describe("热量差汇总", () => {
  let db: Db;
  let user: User;
  const NOW = Date.parse("2026-10-06T08:00:00Z"); // 上海 16:00
  const TODAY = "2026-10-06";
  const eat = (date: string, kcal: number, mealType: "lunch" | "dinner" = "lunch") =>
    createManualMeal(user, { mealType, date, time: "12:00", title: "", people: 1, items: [{ name: "饭", quantity: "", weightG: null, kcal, proteinG: 0, carbsG: 0, fatG: 0, personal: false, eatenFraction: 1 }] });

  beforeEach(() => {
    db = openDb(":memory:");
    setDbForTests(db);
    user = db
      .insert(schema.users)
      .values({ username: "me", passwordHash: "x", displayName: "me", sex: "male", birthDate: "1987-03-04", heightCm: 182.5, calorieTarget: 2000, proteinTargetG: 130, createdAt: 0, updatedAt: 0 })
      .returning()
      .get();
    addMetric(user, { date: "2026-09-06", weightKg: 89.55, bodyFatPct: 26.6, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: 1789, note: null });
  });

  it("录入手表消耗后，当天的消耗和热量差跟着变；清除后退回估算", () => {
    eat(TODAY, 1000);
    let s = getDeficitSummary(user, TODAY, NOW)!;
    expect(s.day).toMatchObject({ burn: 2460, intake: 1000, deficit: 1460, source: "estimate" });
    expect(s.settled).toBe(false);
    expect(s.deficitAtTarget).toBe(460);

    setActivity(user, { date: TODAY, kcal: 1086, kind: "active" });
    s = getDeficitSummary(user, TODAY, NOW)!;
    expect(s.day).toMatchObject({ burn: 2875, deficit: 1875, source: "watch" });
    expect(s.deficitAtTarget).toBe(875);

    setActivity(user, { date: TODAY, kcal: 1200, kind: "active" }); // 同一天再录是更新
    expect(getDeficitSummary(user, TODAY, NOW)!.day.burn).toBe(2989);
    clearActivity(user, TODAY);
    expect(getDeficitSummary(user, TODAY, NOW)!.day.source).toBe("estimate");
  });

  it("记了晚餐就算今天吃完了；累计只统计有记录的日子", () => {
    eat("2026-10-04", 2000);
    eat("2026-10-05", 2860);
    eat(TODAY, 1900, "dinner");
    const s = getDeficitSummary(user, TODAY, NOW)!;
    expect(s.settled).toBe(true);
    expect(s.week).toEqual({ days: 3, total: 460 - 400 + 560 });
    expect(s.allTime.days).toBe(3);
    expect(s.streak).toBe(3);
  });

  it("资料不全时不计算", () => {
    const other = db.insert(schema.users).values({ username: "o", passwordHash: "x", displayName: "o", calorieTarget: 2000, proteinTargetG: 100, createdAt: 0, updatedAt: 0 }).returning().get();
    expect(getDeficitSummary(other, TODAY, NOW)).toBeNull();
  });
});
