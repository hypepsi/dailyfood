import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createDraft, createManualMeal, deleteMeal, getDailyTotals, getMeal, saveMeal, type MealInput } from "@/services/meals";
import { addMetric, getDailySeries } from "@/services/metrics";
import { goalsForDate, updateProfile } from "@/services/profile";
import { buildSnapshot, getDaySummary, renderSnapshot } from "@/services/snapshot";

let db: Db;
let user: User;
let other: User;

function makeUser(username: string): User {
  const now = Date.now();
  return db
    .insert(schema.users)
    .values({ username, passwordHash: "x", displayName: username, calorieTarget: 2000, proteinTargetG: 130, targetWeightKg: 85, createdAt: now, updatedAt: now })
    .returning()
    .get();
}

const DATE = "2026-10-06";
const egg = { name: "鸡蛋", quantity: "2 个", weightG: 100, kcal: 150, proteinG: 13, carbsG: 1, fatG: 10, personal: false };
const meal = (kcal: number, people = 1): MealInput => ({ mealType: "breakfast", date: DATE, time: "08:00", title: "", people, items: [{ ...egg, kcal }] });

beforeEach(() => {
  db = openDb(":memory:");
  setDbForTests(db);
  user = makeUser("me");
  other = makeUser("other");
});

describe("饮食记录", () => {
  it("草稿不计入统计，确认后才计入", () => {
    const id = createDraft(user, { source: "text", title: "早餐", items: [egg], aiEstimate: { estimate: { totalKcal: 150 } }, aiModel: "test", date: DATE });
    expect(getDaySummary(user, DATE).totals.kcal).toBe(0);
    saveMeal(user, id, meal(150));
    expect(getDaySummary(user, DATE).totals.kcal).toBe(150);
  });

  it("统计使用用户确认值，AI 原始估算只留档", () => {
    const id = createDraft(user, { source: "text", title: "晚餐", items: [{ ...egg, kcal: 580 }], aiEstimate: { estimate: { totalKcal: 580 } }, aiModel: "test", date: DATE });
    saveMeal(user, id, meal(650));
    const saved = getMeal(user, id);
    expect(saved.totals.kcal).toBe(650);
    expect(JSON.parse(saved.aiEstimate!).estimate.totalKcal).toBe(580);
    expect(getDailyTotals(user, DATE, DATE)[0].kcal).toBe(650);
  });

  it("剩余热量和蛋白质由程序计算；修改和删除后同步更新", async () => {
    const id = createManualMeal(user, meal(700));
    createManualMeal(user, { ...meal(500), mealType: "lunch" });
    let day = getDaySummary(user, DATE);
    expect(day.kcalRemaining).toBe(800);
    expect(day.proteinRemaining).toBe(104);
    saveMeal(user, id, meal(900));
    expect(getDaySummary(user, DATE).kcalRemaining).toBe(600);
    await deleteMeal(user, id);
    day = getDaySummary(user, DATE);
    expect(day.totals.kcal).toBe(500);
    expect(day.meals).toHaveLength(1);
  });

  it("多人分食：明细存整桌，统计只计入自己的一份", () => {
    const id = createManualMeal(user, meal(900, 3));
    expect(getMeal(user, id).items[0].kcal).toBe(900);
    expect(getMeal(user, id).totals.kcal).toBe(300);
    expect(getDaySummary(user, DATE).totals.kcal).toBe(300);
    expect(getDailyTotals(user, DATE, DATE)[0].kcal).toBe(300);
    // 自己单独吃的一碗饭不分摊
    saveMeal(user, id, { ...meal(900, 3), items: [{ ...egg, kcal: 900 }, { ...egg, name: "米饭", kcal: 174, personal: true }] });
    expect(getMeal(user, id).totals.kcal).toBe(474);
    expect(getDailyTotals(user, DATE, DATE)[0].kcal).toBe(474);
    // 之后发现其实是两个人吃的
    saveMeal(user, id, meal(900, 2));
    expect(getDaySummary(user, DATE).kcalRemaining).toBe(1550);
  });

  it("用户之间的数据互相不可见", () => {
    const id = createManualMeal(user, meal(700));
    expect(() => getMeal(other, id)).toThrow(AppError);
    expect(() => saveMeal(other, id, meal(1))).toThrow(AppError);
    expect(getDaySummary(other, DATE).totals.kcal).toBe(0);
  });
});

describe("目标与身体数据", () => {
  it("修改目标不改变过去日子的评价标准", () => {
    db.insert(schema.goalHistory).values({ userId: user.id, effectiveDate: "2026-09-01", calorieTarget: 2000, proteinTargetG: 130, targetWeightKg: 85, createdAt: 0 }).run();
    updateProfile(user, { displayName: "me", sex: "male", birthDate: "1987-03-04", heightCm: 182.5, timezone: "Asia/Shanghai", activityLevel: "light", calorieTarget: 1800, proteinTargetG: 140, targetWeightKg: 85 });
    expect(goalsForDate(user, "2026-09-15").calorieTarget).toBe(2000);
    expect(goalsForDate(user, "2099-01-01").calorieTarget).toBe(1800);
  });

  it("同一天多次称重取最后一次；至少要填一项", () => {
    addMetric(user, { date: DATE, weightKg: 90, bodyFatPct: null, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: null, note: null });
    expect(getDailySeries(user, "weightKg")).toEqual([{ date: DATE, value: 90 }]);
    expect(getDailySeries(user, "bodyFatPct")).toEqual([]);
    expect(() => addMetric(user, { weightKg: null, bodyFatPct: null, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: null, note: null })).toThrow(AppError);
  });
});

describe("AI 数据快照", () => {
  it("包含程序算好的今日摄入和剩余", () => {
    const now = Date.parse("2026-10-06T04:00:00Z"); // 上海 12:00
    createManualMeal(user, meal(700));
    const text = renderSnapshot(buildSnapshot(user, now));
    expect(text).toContain("今日合计：700 kcal");
    expect(text).toContain("今日剩余热量：1300 kcal");
    expect(text).toContain("蛋白质还差：117 g");
  });
});
