import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { dailyCalorieTarget, dayBurn, deficitTier, fatGrams, loggingStreak } from "@/lib/energy";
import { addDays } from "@/lib/time";
import { clearActivity, setActivity } from "@/services/activity";
import { createManualMeal } from "@/services/meals";
import { addMetric } from "@/services/metrics";
import { getDaySummary, getDeficitSummary } from "@/services/snapshot";

const energy = { bmr: 1789, bmrSource: "实测" as const, tdee: 2460 };

describe("每日消耗", () => {
  it("没有手表数据时按活动水平估算", () => {
    expect(dayBurn(energy, null)).toEqual({ burn: 2460, bmr: 1789, active: 671, source: "estimate" });
  });
  it("手表的运动消耗要加上基础代谢", () => {
    expect(dayBurn(energy, { kcal: 1086 })).toEqual({ burn: 2875, bmr: 1789, active: 1086, source: "watch" });
  });
});

describe("当天的热量目标", () => {
  // 目标 1950，估算消耗 2460 → 计划热量差 510
  it("没有手表数据时不调整", () => {
    expect(dailyCalorieTarget(1950, energy, null)).toEqual({ target: 1950, bonus: 0 });
  });
  it("运动多的日子上调，让热量差保持在计划的水平", () => {
    // 消耗 1789+1050=2839，2839−510=2329 → 取整 2330
    expect(dailyCalorieTarget(1950, energy, { kcal: 1050 })).toEqual({ target: 2330, bonus: 380 });
  });
  it("运动少的日子不下调", () => {
    expect(dailyCalorieTarget(1950, energy, { kcal: 300 })).toEqual({ target: 1950, bonus: 0 });
  });
  it("资料不全算不出消耗时不调整", () => {
    expect(dailyCalorieTarget(1950, null, { kcal: 1050 })).toEqual({ target: 1950, bonus: 0 });
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

    setActivity(user, { date: TODAY, kcal: 1086 });
    s = getDeficitSummary(user, TODAY, NOW)!;
    expect(s.day).toMatchObject({ burn: 2875, deficit: 1875, source: "watch" });
    // 目标随运动上调（2000 → 2420），吃满目标后的热量差仍接近计划的 460
    const day = getDaySummary(user, TODAY, NOW);
    expect(day).toMatchObject({ baseCalorieTarget: 2000, activityBonus: 420, kcalRemaining: 1420 });
    expect(day.goals.calorieTarget).toBe(2420);
    expect(s.deficitAtTarget).toBe(455);

    setActivity(user, { date: TODAY, kcal: 1200 }); // 同一天再录是更新
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

  it("今天还没吃完时，今天不算进累计；没有记录的日子不算热量差", () => {
    eat("2026-10-05", 2000);
    eat(TODAY, 600); // 16:00，只记了午餐
    const s = getDeficitSummary(user, TODAY, NOW)!;
    expect(s.settled).toBe(false);
    expect(s.week).toEqual({ days: 1, total: 460 });
    expect(s.allTime).toEqual({ days: 1, total: 460 });

    const empty = getDeficitSummary(user, "2026-10-03", NOW)!;
    expect(empty.hasRecords).toBe(false);
    expect(empty.week.days).toBe(0);
    expect(getDeficitSummary(user, "2026-10-05", NOW)!.hasRecords).toBe(true);
  });

  it("资料不全时不计算", () => {
    const other = db.insert(schema.users).values({ username: "o", passwordHash: "x", displayName: "o", calorieTarget: 2000, proteinTargetG: 100, createdAt: 0, updatedAt: 0 }).returning().get();
    expect(getDeficitSummary(other, TODAY, NOW)).toBeNull();
  });
});
