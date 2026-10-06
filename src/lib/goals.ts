import type { ActivityLevel } from "@/db/schema";
import { estimateBmr } from "./nutrition";

/** 活动系数：基础代谢 × 系数 ≈ 每日总消耗 */
export const ACTIVITY: Record<ActivityLevel, { label: string; factor: number }> = {
  sedentary: { label: "久坐，几乎不运动", factor: 1.2 },
  light: { label: "轻度活动，每周运动 1~3 次", factor: 1.375 },
  moderate: { label: "中度活动，每周运动 3~5 次", factor: 1.55 },
  active: { label: "高强度，每周运动 6~7 次", factor: 1.725 },
};

/** 推荐的每日热量缺口：约对应每周减 0.45 kg（1 kg 脂肪 ≈ 7700 kcal） */
const DAILY_DEFICIT = 500;
export const KCAL_PER_KG = 7700;
const MIN_CALORIES = 1200;

export type BodyFacts = {
  sex: "male" | "female" | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  /** 体脂秤实测的基础代谢，有则优先使用 */
  measuredBmr: number | null;
  activityLevel: ActivityLevel;
  targetWeightKg: number | null;
};

export type Energy = { bmr: number; bmrSource: "实测" | "公式估算"; tdee: number };

/** 基础代谢和每日总消耗；资料不全时返回 null */
export function estimateEnergy(f: BodyFacts): Energy | null {
  let bmr: number | null = f.measuredBmr;
  let bmrSource: Energy["bmrSource"] = "实测";
  if (bmr === null) {
    if (!f.sex || f.age === null || !f.heightCm || !f.weightKg) return null;
    bmr = estimateBmr(f.sex, f.weightKg, f.heightCm, f.age);
    bmrSource = "公式估算";
  }
  return { bmr: Math.round(bmr), bmrSource, tdee: Math.round(bmr * ACTIVITY[f.activityLevel].factor) };
}

export type GoalRecommendation = Energy & {
  calorieTarget: number;
  proteinTargetG: number;
  /** 蛋白质是按什么算的，展示给用户 */
  proteinBasis: string;
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * 根据最新身体数据推荐每日目标（纯计算，不调用 AI）：
 * - 热量 = 每日总消耗 − 500，但不低于基础代谢，也不低于 1200
 * - 蛋白质 = 去脂体重 × 2.0 g（知道体脂率时），否则 目标体重 × 1.6 g
 */
export function recommendGoals(f: BodyFacts): GoalRecommendation | null {
  const energy = estimateEnergy(f);
  if (!energy || !f.weightKg) return null;
  const calorieTarget = roundTo(Math.max(energy.tdee - DAILY_DEFICIT, energy.bmr, MIN_CALORIES), 50);

  let protein: number;
  let proteinBasis: string;
  if (f.bodyFatPct !== null) {
    const lean = f.weightKg * (1 - f.bodyFatPct / 100);
    protein = lean * 2.0;
    proteinBasis = `去脂体重 ${lean.toFixed(1)} kg × 2.0 g`;
  } else {
    const base = f.targetWeightKg ?? f.weightKg;
    protein = base * 1.6;
    proteinBasis = `${f.targetWeightKg ? "目标体重" : "体重"} ${base} kg × 1.6 g`;
  }
  return { ...energy, calorieTarget, proteinTargetG: roundTo(protein, 5), proteinBasis };
}
