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

  it("节奏调节：每一档 = 每日消耗 ± 固定量", () => {
    // 每日消耗 2460
    const target = (pace: Parameters<typeof recommendGoals>[1]) => recommendGoals(me, pace)!;
    expect(target("gain")).toMatchObject({ calorieTarget: 2750, limited: false });
    expect(target("maintain")).toMatchObject({ calorieTarget: 2450, limited: false });
    expect(target("slow")).toMatchObject({ calorieTarget: 2200, limited: false });
    expect(target("steady")).toMatchObject({ calorieTarget: 1950, limited: false });
    // 2460 − 750 = 1710，低于基础代谢 1789 → 只给到 1800，并标记“被拦住了”
    expect(target("fast")).toMatchObject({ calorieTarget: 1800, limited: true });
    // 蛋白质不随节奏变
    expect(new Set(["gain", "maintain", "slow", "steady", "fast"].map((p) => target(p as "gain").proteinTargetG)).size).toBe(1);
  });

  it("资料不全时不给推荐", () => {
    expect(recommendGoals({ ...me, weightKg: null })).toBeNull();
    expect(estimateEnergy({ ...me, measuredBmr: null, heightCm: null })).toBeNull();
  });
});
