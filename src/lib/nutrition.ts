import type { MealType } from "@/db/schema";

export type Nutrients = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumNutrients(items: Nutrients[]): Nutrients {
  const total = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      proteinG: acc.proteinG + i.proteinG,
      carbsG: acc.carbsG + i.carbsG,
      fatG: acc.fatG + i.fatG,
    }),
    ZERO,
  );
  return {
    kcal: Math.round(total.kcal),
    proteinG: round1(total.proteinG),
    carbsG: round1(total.carbsG),
    fatG: round1(total.fatG),
  };
}

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};

/** 按当地时间猜测餐次，用户可在确认页修改 */
export function guessMealType(hour: number, minute = 0): MealType {
  const t = hour + minute / 60;
  if (t >= 5 && t < 10.5) return "breakfast";
  if (t >= 11 && t < 14.5) return "lunch";
  if (t >= 17 && t < 21) return "dinner";
  return "snack";
}

/** 减脂期蛋白质默认值：约 1.6 g/kg 目标体重，取整到 5 g */
export function defaultProteinTarget(targetWeightKg: number): number {
  return Math.round((targetWeightKg * 1.6) / 5) * 5;
}

/** Mifflin-St Jeor 基础代谢估算；有实测值时优先用实测值 */
export function estimateBmr(sex: "male" | "female", weightKg: number, heightCm: number, age: number): number {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161));
}
