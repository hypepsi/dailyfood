import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { addDays, localDate } from "@/lib/time";
import { createDraft, createManualMeal, deleteMeal, getDailyTotals, getMeal, saveMeal, type MealInput } from "@/services/meals";
import { addMetric, getDailySeries } from "@/services/metrics";
import { syncPlan } from "@/services/plan";
import { goalsForDate, setGoals, updateProfile } from "@/services/profile";
import { buildSnapshot, getDaySummary, getWeightStats, renderSnapshot } from "@/services/snapshot";

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
const egg = { name: "鸡蛋", quantity: "2 个", weightG: 100, kcal: 150, proteinG: 13, carbsG: 1, fatG: 10, personal: false, eatenFraction: 1 };
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

  it("修正：明细保留原始份量，统计按实际吃掉的比例计入", () => {
    const rice = { ...egg, name: "米饭", kcal: 232 };
    const id = createManualMeal(user, { ...meal(430), items: [{ ...egg, kcal: 430 }, rice] });
    expect(getDaySummary(user, DATE).totals.kcal).toBe(662);
    // 米饭只吃了一半
    saveMeal(user, id, { ...meal(430), items: [{ ...egg, kcal: 430 }, { ...rice, eatenFraction: 0.5 }] });
    expect(getMeal(user, id).items[1].kcal).toBe(232);
    expect(getMeal(user, id).totals.kcal).toBe(546);
    expect(getDailyTotals(user, DATE, DATE)[0].kcal).toBe(546);
    // 两人分食且整体只吃了一半：430×0.5÷2 + 232×0.5÷2
    saveMeal(user, id, { ...meal(430, 2), items: [{ ...egg, kcal: 430, eatenFraction: 0.5 }, { ...rice, eatenFraction: 0.5 }] });
    expect(getDailyTotals(user, DATE, DATE)[0].kcal).toBe(166);
  });

  it("名称跟着内容走：食物没变时保留原名，改了食物就换名称", () => {
    const id = createDraft(user, { source: "photo", title: "肉片炖粗面", items: [{ ...egg, name: "粗面" }], aiEstimate: {}, aiModel: "t", date: DATE });
    saveMeal(user, id, { ...meal(500), items: [{ ...egg, name: "粗面", kcal: 500 }] });
    expect(getMeal(user, id).title).toBe("肉片炖粗面"); // 只改了热量
    saveMeal(user, id, { ...meal(500), items: [{ ...egg, name: "乌冬面寿喜锅", kcal: 720 }] });
    expect(getMeal(user, id).title).toBe("乌冬面寿喜锅"); // 改了食物，没给新名称 → 用食物名
    saveMeal(user, id, { ...meal(500), title: "寿喜乌冬", items: [{ ...egg, name: "乌冬面", kcal: 700 }] });
    expect(getMeal(user, id).title).toBe("寿喜乌冬"); // 给了新名称就用它
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
    setGoals(user, { calorieTarget: 1800, proteinTargetG: 140 });
    expect(goalsForDate(user, "2026-09-15").calorieTarget).toBe(2000);
    expect(goalsForDate(user, "2099-01-01").calorieTarget).toBe(1800);
  });

  it("第一次改目标时保留旧目标：过去的日子不会被新目标重新评价", () => {
    // 从没改过目标的用户（没有任何历史）
    expect(goalsForDate(user, "2026-01-01").calorieTarget).toBe(2000);
    setGoals(user, { calorieTarget: 1700, proteinTargetG: 150 });
    expect(goalsForDate(user, "2026-01-01")).toEqual({ calorieTarget: 2000, proteinTargetG: 130, targetWeightKg: 85 });
    expect(goalsForDate(user, "2099-01-01").calorieTarget).toBe(1700);
  });

  it("每天吃多少由节奏和身体数据自动算出：换节奏、更新身体数据都会跟着变", () => {
    const profile = { displayName: "me", sex: "male" as const, birthDate: "1987-03-04", heightCm: 182.5, timezone: "Asia/Shanghai", activityLevel: "light" as const, estimateStyle: "standard" as const, targetWeightKg: null };
    // 资料不全（还没有体重）时算不出来，保留原来的目标
    updateProfile(user, { ...profile, goalPace: "steady" });
    expect(syncPlan(user.id)).toBeNull();

    // 有了身体数据：基础代谢 1789 × 1.375 = 2460，稳稳减 → 1950；去脂体重 65.7 × 2 → 130
    const today = localDate(Date.now(), "Asia/Shanghai");
    addMetric(user, { date: addDays(today, -1), weightKg: 89.55, bodyFatPct: 26.6, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: 1789, note: null });
    expect(syncPlan(user.id)).toEqual({ calorieTarget: 1950, proteinTargetG: 130 });
    expect(syncPlan(user.id)).toBeNull(); // 没有变化就不重复写

    // 换成保持
    updateProfile(user, { ...profile, goalPace: "maintain" });
    expect(syncPlan(user.id)).toEqual({ calorieTarget: 2450, proteinTargetG: 130 });

    // 新的体脂秤报告：基础代谢变了，目标自动跟着变
    // （基础代谢 1700 × 1.375 = 2338 → 2350；两天平均体重 88.78、体脂 25% → 去脂体重 66.6 × 2 → 135）
    addMetric(user, { date: today, weightKg: 88, bodyFatPct: 25, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: 1700, note: null });
    expect(syncPlan(user.id)).toEqual({ calorieTarget: 2350, proteinTargetG: 135 });
    const stored = db.select().from(schema.users).all().find((u) => u.id === user.id)!;
    expect([stored.calorieTarget, stored.proteinTargetG]).toEqual([2350, 135]);
  });

  it("不能把饮食记到未来", () => {
    expect(() => createManualMeal(user, { ...meal(500), date: "2099-01-01" })).toThrow(AppError);
    const id = createManualMeal(user, meal(500));
    expect(() => saveMeal(user, id, { ...meal(500), date: "2099-01-01" })).toThrow(AppError);
  });

  it("很久没称重时仍然能拿到最后一次的体重", () => {
    addMetric(user, { date: "2026-01-10", weightKg: 91, bodyFatPct: null, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: null, note: null });
    const stats = getWeightStats(user, "2026-10-06");
    expect(stats).toMatchObject({ latestKg: 91, latestDate: "2026-01-10", avg7Kg: null, trend30PerWeek: null });
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
