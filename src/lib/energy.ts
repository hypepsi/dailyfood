import { KCAL_PER_KG, type Energy } from "./goals";

/** 手表记录的运动消耗，不含基础代谢 */
export type ActivityEntry = { kcal: number };

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
 * 录入了手表数据就用手表的：基础代谢 + 运动消耗；
 * 没录入则退回到 基础代谢 × 活动系数。
 */
export function dayBurn(energy: Energy, activity: ActivityEntry | null): DayBurn {
  if (!activity) return { burn: energy.tdee, bmr: energy.bmr, active: energy.tdee - energy.bmr, source: "estimate" };
  return { burn: energy.bmr + activity.kcal, bmr: energy.bmr, active: activity.kcal, source: "watch" };
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

// ---------- 把热量差换成看得见、摸得着的东西 ----------

/** 脂肪克数 → “3 两”“1 斤 2 两”这样的说法（1 斤 = 500 g，1 两 = 50 g） */
export function fatInJin(grams: number): string {
  const liang = Math.round(Math.abs(grams) / 50);
  if (liang === 0) return "不到 1 两";
  const jin = Math.floor(liang / 10);
  const rest = liang % 10;
  return jin === 0 ? `${rest} 两` : rest === 0 ? `${jin} 斤` : `${jin} 斤 ${rest} 两`;
}

/** 拿一样日常的东西来比这么多脂肪有多重；从重到轻找第一个不超过它的 */
const OBJECTS: [grams: number, name: string][] = [
  [10000, "一桶 10 升的水"],
  [5000, "一袋 10 斤的大米"],
  [2500, "一个小西瓜"],
  [1000, "一大盒 1 升的牛奶"],
  [500, "一瓶矿泉水"],
  [330, "一罐可乐"],
  [200, "一个苹果"],
  [100, "一根香蕉"],
  [50, "一个鸡蛋"],
];
export function weighsLike(grams: number): string | null {
  return OBJECTS.find(([g]) => grams >= g)?.[1] ?? null;
}

/** 一碗米饭（150 g）的热量 */
const RICE_BOWL_KCAL = 174;

/** 今天的缺口大概等于什么：几碗米饭、慢跑多少分钟 */
export function deficitEquivalents(deficit: number, weightKg: number | null) {
  // 慢跑约 7 MET：每分钟消耗 ≈ 7 × 3.5 × 体重 ÷ 200 千卡
  const perMinute = (7 * 3.5 * (weightKg ?? 70)) / 200;
  return {
    riceBowls: Math.round((deficit / RICE_BOWL_KCAL) * 2) / 2,
    jogMinutes: Math.round(deficit / perMinute / 5) * 5,
  };
}

export type Journey = {
  /** 从开始时的体重到目标体重，一共要减多少公斤 */
  totalKg: number;
  /** 按累计热量差推算，已经减掉的公斤数（可能为负） */
  doneKg: number;
  /** 0~100 */
  percent: number;
  /** 照最近的速度，预计哪天到目标；数据太少或没有缺口时为 null */
  eta: string | null;
};

/**
 * 到目标体重的进度，按累计热量差推算。
 * 预计日期只在最近 7 天里有 5 天以上的记录、且平均每天确实有缺口时才给；最远只估一年。
 */
export function journey(input: { startKg: number; targetKg: number; totalDeficit: number; recentDays: number; recentDeficit: number; today: string }, addDays: (d: string, n: number) => string): Journey | null {
  const totalKg = Math.round((input.startKg - input.targetKg) * 10) / 10;
  if (totalKg <= 0) return null;
  const doneKg = Math.round((input.totalDeficit / KCAL_PER_KG) * 100) / 100;
  const percent = Math.max(0, Math.min(100, Math.round((doneKg / totalKg) * 100)));
  let eta: string | null = null;
  const perDay = input.recentDays >= 5 ? input.recentDeficit / input.recentDays : 0;
  if (perDay > 0 && doneKg < totalKg) {
    const daysLeft = Math.ceil(((totalKg - doneKg) * KCAL_PER_KG) / perDay);
    if (daysLeft <= 365) eta = addDays(input.today, daysLeft);
  }
  return { totalKg, doneKg, percent, eta };
}
