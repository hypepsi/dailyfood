import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { normalizeReview } from "@/lib/ai/review";
import { AppError } from "@/lib/errors";
import { addDays } from "@/lib/time";
import { setActivity } from "@/services/activity";
import { createManualMeal } from "@/services/meals";
import { addMetric } from "@/services/metrics";
import { generateReview, getReviewWindow, renderReviewData } from "@/services/review";

const dim = (key: string) => ({ key, verdict: "ok", summary: "结论", evidence: "依据" });
const KEYS = ["calories", "protein", "deficit", "food_quality", "rhythm", "weight", "activity", "logging"];
const full = { headline: "这周很稳", dimensions: KEYS.map(dim), wins: ["a"], issues: ["b"], next_week: ["1", "2", "3", "4"] };

describe("复盘结果校验", () => {
  it("八个维度齐全时通过，并按固定顺序排列；行动最多 3 条", () => {
    const r = normalizeReview({ ...full, dimensions: [...KEYS].reverse().map(dim) });
    expect(r.dimensions.map((d) => d.key)).toEqual(KEYS);
    expect(r.nextWeek).toEqual(["1", "2", "3"]);
  });
  it("缺维度、没有总结或没有行动时拒绝", () => {
    expect(() => normalizeReview({ ...full, dimensions: KEYS.slice(1).map(dim) })).toThrow();
    expect(() => normalizeReview({ ...full, headline: " " })).toThrow();
    expect(() => normalizeReview({ ...full, next_week: [] })).toThrow();
  });
});

describe("复盘窗口与数据", () => {
  let db: Db;
  let user: User;
  const NOW = Date.parse("2026-10-06T08:00:00Z"); // 上海 10-06 16:00，今天还没吃完
  const eat = (date: string, kcal: number, mealType: "lunch" | "dinner" = "lunch", time = "12:30") =>
    createManualMeal(user, { mealType, date, time, title: "", people: 1, items: [{ name: "牛肉饭", quantity: "1 份", weightG: 400, kcal, proteinG: 40, carbsG: 60, fatG: 20, personal: false, eatenFraction: 1 }] });

  beforeEach(() => {
    db = openDb(":memory:");
    setDbForTests(db);
    user = db
      .insert(schema.users)
      .values({ username: "me", passwordHash: "x", displayName: "me", sex: "male", birthDate: "1987-03-04", heightCm: 182.5, calorieTarget: 2000, proteinTargetG: 130, createdAt: 0, updatedAt: 0 })
      .returning()
      .get();
    addMetric(user, { date: "2026-09-29", weightKg: 89.5, bodyFatPct: 26.6, waistCm: null, muscleKg: null, skeletalMuscleKg: null, visceralFat: null, bmrKcal: 1789, note: null });
  });

  it("窗口是到昨天为止的 7 天；缺一天就不能生成，并且不会调用模型", async () => {
    for (let i = 1; i <= 7; i++) if (i !== 3) eat(addDays("2026-10-06", -i), 1800);
    const w = getReviewWindow(user, NOW);
    expect([w.start, w.end]).toEqual(["2026-09-29", "2026-10-05"]);
    expect(w.loggedDays).toBe(6);
    expect(w.ready).toBe(false);
    expect(w.days.find((d) => !d.logged)?.date).toBe("2026-10-03");
    await expect(generateReview(user, NOW)).rejects.toThrow(AppError);
  });

  it("窗口永远到昨天为止，今天即使吃完了也不算", () => {
    eat("2026-10-06", 700, "dinner", "18:30");
    expect(getReviewWindow(user, NOW).end).toBe("2026-10-05");
  });

  it("交给模型的数据由程序算好：平均、供能比、热量差、晚间进食、手表消耗", () => {
    for (let i = 1; i <= 7; i++) eat(addDays("2026-10-06", -i), 1800);
    eat("2026-10-05", 400, "dinner", "22:10");
    setActivity(user, { date: "2026-10-04", kcal: 900 });
    const w = getReviewWindow(user, NOW);
    expect(w.ready).toBe(true);
    const text = renderReviewData(user, w, NOW);
    expect(text).toContain("日均摄入 1857 kcal"); // (1800×7+400)/7
    expect(text).toContain("最高 2026-10-05 2200 kcal");
    expect(text).toContain("供能比：蛋白质 28%，碳水 41%，脂肪 31%");
    expect(text).toContain("21 点以后进食 1 次，共 400 kcal");
    expect(text).toContain("1 天录入了手表数据，平均运动消耗 900 kcal/天");
    // 消耗：6 天按估算 2460，10-04 为 1789+900=2689；累计 = 6×2460 + 2689 − 13000
    expect(text).toContain("7 天累计热量差 +4449 kcal");
    expect(text).toContain("晚餐：1 天有记录");
  });
});
