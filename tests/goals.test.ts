import { describe, expect, it } from "vitest";
import { estimateEnergy, recommendGoals, type BodyFacts } from "@/lib/goals";

const me: BodyFacts = { sex: "male", age: 39, heightCm: 182.5, weightKg: 89.55, bodyFatPct: 26.6, measuredBmr: 1789, activityLevel: "light", targetWeightKg: 85 };

describe("目标推荐", () => {
  it("优先用实测基础代谢；热量 = 总消耗 − 500；蛋白质按去脂体重", () => {
    const rec = recommendGoals(me)!;
    expect(rec).toMatchObject({ bmr: 1789, bmrSource: "实测", tdee: 2460, calorieTarget: 1950, proteinTargetG: 130 });
  });

  it("没有实测值时用公式；没有体脂率时按目标体重算蛋白质", () => {
    const rec = recommendGoals({ ...me, measuredBmr: null, bodyFatPct: null })!;
    expect(rec.bmrSource).toBe("公式估算");
    expect(rec.bmr).toBe(1846);
    expect(rec.proteinTargetG).toBe(135);
  });

  it("推荐热量不会低于基础代谢，也不会低于 1200", () => {
    expect(recommendGoals({ ...me, activityLevel: "sedentary" })!.calorieTarget).toBe(1800); // 2147−500 < 1789 → 1789 → 取整 1800
    expect(recommendGoals({ ...me, sex: "female", measuredBmr: 1000, activityLevel: "sedentary" })!.calorieTarget).toBe(1200);
  });

  it("资料不全时不给推荐", () => {
    expect(recommendGoals({ ...me, weightKg: null })).toBeNull();
    expect(estimateEnergy({ ...me, measuredBmr: null, heightCm: null })).toBeNull();
  });
});
