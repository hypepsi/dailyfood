import { describe, expect, it } from "vitest";
import { normalizeGlucose } from "@/lib/ai/glucose";
import { zonedToUtc } from "@/lib/time";
import { glucoseStatus, renderGlucoseData } from "@/services/glucose";
import type { MealWithItems } from "@/services/meals";

const tz = "Asia/Shanghai";
const at = (time: string) => zonedToUtc("2026-10-25", time, tz);
const meal = (mealType: string, extra: Partial<MealWithItems> = {}) =>
  ({ id: 1, mealType, eatenAt: at("12:00"), sharePeople: 1, items: [], totals: { kcal: 600, proteinG: 30, carbsG: 70, fatG: 20 }, ...extra }) as unknown as MealWithItems;

describe("血糖盘点什么时候开始", () => {
  it("三餐都记了就开始，不用等到晚上", () => {
    const s = glucoseStatus([meal("breakfast"), meal("lunch"), meal("dinner")], true, at("18:30"), tz);
    expect(s.ready).toBe(true);
  });
  it("三餐没记全时，到 21:30 才开始", () => {
    const meals = [meal("breakfast"), meal("lunch")];
    expect(glucoseStatus(meals, true, at("21:29"), tz).ready).toBe(false);
    expect(glucoseStatus(meals, true, at("21:30"), tz).ready).toBe(true);
    expect(glucoseStatus(meals, true, at("21:29"), tz).logged).toEqual({ breakfast: true, lunch: true, dinner: false });
  });
  it("一顿都没记就不盘点", () => {
    expect(glucoseStatus([], true, at("23:00"), tz).ready).toBe(false);
  });
});

describe("交给 AI 的数据", () => {
  it("按实际吃进去的量：吃了一半、两人合吃都算进去", () => {
    const text = renderGlucoseData(
      [
        meal("lunch", {
          eatenAt: at("12:10"),
          sharePeople: 2,
          items: [
            { name: "白米饭", quantity: "1 碗", weightG: 200, kcal: 232, proteinG: 5, carbsG: 52, fatG: 0, personal: true, eatenFraction: 0.5 },
            { name: "番茄炒蛋", quantity: "1 盘", weightG: 300, kcal: 300, proteinG: 18, carbsG: 12, fatG: 20, personal: false, eatenFraction: 1 },
          ] as never,
        }),
      ],
      tz,
    );
    expect(text).toContain("午餐 12:10");
    expect(text).toContain("白米饭（1 碗，约100g）：116 kcal，碳水 26 g");
    expect(text).toContain("番茄炒蛋（1 盘，约150g）：150 kcal，碳水 6 g");
  });
});

describe("盘点结果的校验", () => {
  const full = { level: "steady", summary: "今天整体很平稳。", meals: [{ meal: "早餐", level: "steady", note: "鸡蛋豆浆配玉米" }], tips: ["保持", "第二条", "第三条会被丢掉"] };
  it("最多两条建议", () => {
    expect(normalizeGlucose(full).tips).toEqual(["保持", "第二条"]);
  });
  it("没有总结或建议时拒绝", () => {
    expect(() => normalizeGlucose({ ...full, summary: "" })).toThrow();
    expect(() => normalizeGlucose({ ...full, tips: [] })).toThrow();
    expect(() => normalizeGlucose({ ...full, level: "high" })).toThrow();
  });
});
