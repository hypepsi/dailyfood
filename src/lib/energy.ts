import type { ActivityKind } from "@/db/schema";
import { KCAL_PER_KG, type Energy } from "./goals";

export type ActivityEntry = { kcal: number; kind: ActivityKind };

export type DayBurn = {
  /** 当天总消耗 */
  burn: number;
  bmr: number;
  /** 基础代谢之外的部分 */
  active: number;
  /** watch=用户录入的手表数据；estimate=按活动水平估算 */
  source: "watch" | "estimate";
};

/**
 * 某一天消耗了多少热量。
 * 录入了手表数据就用手表的：活动消耗 + 基础代谢，或直接用全天总消耗；
 * 没录入则退回到 基础代谢 × 活动系数。
 */
export function dayBurn(energy: Energy, activity: ActivityEntry | null): DayBurn {
  if (!activity) return { burn: energy.tdee, bmr: energy.bmr, active: energy.tdee - energy.bmr, source: "estimate" };
  if (activity.kind === "active") return { burn: energy.bmr + activity.kcal, bmr: energy.bmr, active: activity.kcal, source: "watch" };
  // 全天总消耗不可能低于基础代谢；低于时多半是一天还没过完，先按基础代谢算
  const burn = Math.max(activity.kcal, energy.bmr);
  return { burn, bmr: energy.bmr, active: burn - energy.bmr, source: "watch" };
}

export type Tier = { key: "surplus" | "even" | "small" | "steady" | "strong" | "too_much"; label: string; message: string };

/**
 * 热量差的档位。最好的一档是 350~750（约每周减 0.3~0.7 kg）；
 * 缺口超过 1000 不当作成就来鼓励。
 */
export function deficitTier(deficit: number): Tier {
  if (deficit < -100) return { key: "surplus", label: "今天吃超了", message: "一天超了很正常，明天照常吃就好，不用少吃来补偿。" };
  if (deficit < 150) return { key: "even", label: "基本持平", message: "今天没长也没掉，守住了。" };
  if (deficit < 350) return { key: "small", label: "小步前进", message: "有缺口就是在前进，积少成多。" };
  if (deficit <= 750) return { key: "steady", label: "稳稳减脂", message: "这是最健康、最容易坚持的节奏。" };
  if (deficit <= 1000) return { key: "strong", label: "强力燃脂", message: "今天缺口不小，记得吃够蛋白质。" };
  return { key: "too_much", label: "缺口偏大", message: "缺口太大不容易坚持，也容易掉肌肉，别饿着自己。" };
}

/** 热量差折合成脂肪的克数（1 kg 脂肪 ≈ 7700 kcal）；可以为负 */
export const fatGrams = (deficit: number) => Math.round((deficit / KCAL_PER_KG) * 1000);

/** 以 endDate 结尾的连续记录天数；今天还没记时从昨天算起 */
export function loggingStreak(loggedDates: Set<string>, today: string, previousDay: (date: string) => string): number {
  let cursor = loggedDates.has(today) ? today : previousDay(today);
  let streak = 0;
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = previousDay(cursor);
  }
  return streak;
}
