import type { ActivityLevel, GoalPace } from "@/db/schema";
import { estimateBmr } from "./nutrition";

/** 活动系数：基础代谢 × 系数 ≈ 每日总消耗 */
export const ACTIVITY: Record<ActivityLevel, { label: string; factor: number }> = {
  sedentary: { label: "久坐，几乎不运动", factor: 1.2 },
  light: { label: "轻度活动，每周运动 1~3 次", factor: 1.375 },
  moderate: { label: "中度活动，每周运动 3~5 次", factor: 1.55 },
  active: { label: "高强度，每周运动 6~7 次", factor: 1.725 },
};

export const KCAL_PER_KG = 7700;
const MIN_CALORIES = 1200;

export type Direction = "loss" | "maintain" | "gain";

/**
 * 节奏：每天比消耗多吃或少吃多少。推荐的热量目标 = 每日消耗 + delta。
 * 1 kg 体重约等于 7700 kcal，所以 −500/天 ≈ 每周 −0.45 kg。
 */
export const PACES: Record<GoalPace, { label: string; delta: number; direction: Direction; hint: string }> = {
  gain: { label: "增重", delta: 300, direction: "gain", hint: "每天比消耗多吃 300，大约每月重 1 公斤" },
  maintain: { label: "保持", delta: 0, direction: "maintain", hint: "吃的和消耗的一样多，体重不变" },
  slow: { label: "慢慢减", delta: -250, direction: "loss", hint: "每天少吃 250，大约每月轻 1 公斤，最不费劲" },
  steady: { label: "稳稳减", delta: -500, direction: "loss", hint: "每天少吃 500，大约每周轻 0.45 公斤" },
  fast: { label: "快速减", delta: -750, direction: "loss", hint: "每天少吃 750，大约每周轻 0.7 公斤，不建议超过一两个月" },
};

export const directionOf = (pace: GoalPace): Direction => PACES[pace].direction;

export type BodyFacts = {
  sex: "male" | "female" | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
  /** 体脂秤实测的基础代谢，有则优先使用 */
  measuredBmr: number | null;
  activityLevel: ActivityLevel;
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
  pace: GoalPace;
  calorieTarget: number;
  /** 想少吃的量被“不低于基础代谢”拦住了，实际缺口比这一档写的小 */
  limited: boolean;
  proteinTargetG: number;
  /** 蛋白质是按什么算的，展示给用户 */
  proteinBasis: string;
};

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/**
 * 根据最新身体数据和用户选的节奏推荐每日目标（纯计算，不调用 AI）：
 * - 热量 = 每日总消耗 + 这一档的增减量；减的时候不低于基础代谢，也不低于 1200
 * - 蛋白质 = 去脂体重 × 2.0 g（知道体脂率时），否则 身高对应的标准体重 × 1.6 g
 */
export function recommendGoals(f: BodyFacts, pace: GoalPace = "steady"): GoalRecommendation | null {
  const energy = estimateEnergy(f);
  if (!energy || !f.weightKg) return null;
  const wanted = roundTo(energy.tdee + PACES[pace].delta, 50);
  // 受下限约束时向上取整，保证不低于基础代谢
  const floor = Math.ceil(Math.max(energy.bmr, MIN_CALORIES) / 50) * 50;
  const limited = PACES[pace].delta < 0 && wanted < floor;
  const calorieTarget = limited ? floor : wanted;

  let protein: number;
  let proteinBasis: string;
  if (f.bodyFatPct !== null) {
    const lean = f.weightKg * (1 - f.bodyFatPct / 100);
    protein = lean * 2.0;
    proteinBasis = `去脂体重 ${lean.toFixed(1)} kg × 2.0 g`;
  } else if (f.heightCm) {
    // 不知道体脂率时，按身高对应的标准体重（BMI 22）来算，免得体重大的人被算出过高的蛋白质
    const reference = 22 * (f.heightCm / 100) ** 2;
    protein = reference * 1.6;
    proteinBasis = `身高对应的标准体重 ${reference.toFixed(1)} kg × 1.6 g`;
  } else {
    protein = f.weightKg * 1.4;
    proteinBasis = `体重 ${f.weightKg} kg × 1.4 g`;
  }
  return { ...energy, pace, calorieTarget, limited, proteinTargetG: roundTo(protein, 5), proteinBasis };
}
