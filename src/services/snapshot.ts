import type { User } from "@/db/schema";
import { MEAL_LABELS, estimateBmr, round1, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { addDays, ageOn, localParts } from "@/lib/time";
import { trendPerWeek, windowAverage } from "@/lib/weight";
import { getConfirmedMeals, getDailyTotals, type MealWithItems } from "./meals";
import { getDailySeries, getLatest } from "./metrics";
import { goalsForDate, type Goals } from "./profile";

export type WeightStats = {
  latestKg: number | null;
  latestDate: string | null;
  avg7Kg: number | null;
  /** 再往前 7 天的均值，用来和本周均值比较 */
  prevAvg7Kg: number | null;
  trend30PerWeek: number | null;
};

export type DaySummary = {
  date: string;
  goals: Goals;
  meals: MealWithItems[];
  totals: Nutrients;
  kcalRemaining: number;
  proteinRemaining: number;
};

export function getDaySummary(user: User, date: string): DaySummary {
  const goals = goalsForDate(user, date);
  const meals = getConfirmedMeals(user, date);
  const totals = sumNutrients(meals.map((m) => m.totals));
  return {
    date,
    goals,
    meals,
    totals,
    kcalRemaining: goals.calorieTarget - totals.kcal,
    proteinRemaining: round1(goals.proteinTargetG - totals.proteinG),
  };
}

export function getWeightStats(user: User, date: string): WeightStats {
  const series = getDailySeries(user, "weightKg", addDays(date, -44), date);
  const latest = series.at(-1) ?? null;
  return {
    latestKg: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    avg7Kg: windowAverage(series, date, 7),
    prevAvg7Kg: windowAverage(series, addDays(date, -7), 7),
    trend30PerWeek: trendPerWeek(series, date, 30),
  };
}

/**
 * 交给 AI 的数据快照：全部来自数据库，全部由程序算好。
 * AI 只负责解释和建议，不负责回忆和计算。
 */
export function buildSnapshot(user: User, now = Date.now()) {
  const local = localParts(now, user.timezone);
  const day = getDaySummary(user, local.date);
  const recentDays = getDailyTotals(user, addDays(local.date, -14), addDays(local.date, -1));
  const weight = getWeightStats(user, local.date);
  const bodyFat = getLatest(user, "bodyFatPct");
  const waist = getLatest(user, "waistCm");
  const measuredBmr = getLatest(user, "bmrKcal");
  const age = user.birthDate ? ageOn(user.birthDate, local.date) : null;
  const estimatedBmr =
    user.sex && user.heightCm && age !== null && weight.latestKg
      ? estimateBmr(user.sex, weight.latestKg, user.heightCm, age)
      : null;
  const avg = (pick: (d: Nutrients) => number) =>
    recentDays.length ? Math.round(recentDays.reduce((s, d) => s + pick(d), 0) / recentDays.length) : null;

  return {
    date: local.date,
    time: local.time,
    timezone: user.timezone,
    profile: { name: user.displayName, sex: user.sex, age, heightCm: user.heightCm },
    day,
    recent: {
      days: recentDays,
      loggedDays: recentDays.length,
      avgKcal: avg((d) => d.kcal),
      avgProteinG: avg((d) => d.proteinG),
    },
    weight,
    bodyFat,
    waist,
    bmr: measuredBmr ? { value: measuredBmr.value, source: "实测" } : estimatedBmr ? { value: estimatedBmr, source: "公式估算" } : null,
  };
}

export type Snapshot = ReturnType<typeof buildSnapshot>;

const fmt = (n: number | null, unit: string) => (n === null ? "暂无数据" : `${n}${unit}`);

/** 把快照渲染成给模型看的文本 */
export function renderSnapshot(s: Snapshot): string {
  const { day, recent, weight } = s;
  const lines: string[] = [];
  lines.push(`当前时间：${s.date} ${s.time}`);
  lines.push(
    `用户：${s.profile.name}，${s.profile.sex === "male" ? "男" : s.profile.sex === "female" ? "女" : "性别未填"}，` +
      `${fmt(s.profile.age, "岁")}，身高${fmt(s.profile.heightCm, "cm")}`,
  );
  lines.push(
    `目标：每日热量 ${day.goals.calorieTarget} kcal，每日蛋白质 ${day.goals.proteinTargetG} g，目标体重 ${fmt(day.goals.targetWeightKg, "kg")}`,
  );
  if (s.bmr) lines.push(`基础代谢：约 ${Math.round(s.bmr.value)} kcal（${s.bmr.source}）`);

  lines.push("", "【今天已确认的饮食】");
  if (day.meals.length === 0) lines.push("今天还没有任何记录。");
  for (const m of day.meals) {
    const time = localParts(m.eatenAt, s.timezone).time;
    const items = m.items.map((i) => `${i.name}${i.quantity ? ` ${i.quantity}` : ""} ${Math.round(i.kcal)}kcal`).join("；");
    lines.push(`- ${MEAL_LABELS[m.mealType]} ${time}：${m.totals.kcal} kcal，蛋白质 ${Math.round(m.totals.proteinG)} g（${items}）`);
  }
  lines.push(
    `今日合计：${day.totals.kcal} kcal，蛋白质 ${Math.round(day.totals.proteinG)} g，碳水 ${Math.round(day.totals.carbsG)} g，脂肪 ${Math.round(day.totals.fatG)} g`,
  );
  lines.push(
    day.kcalRemaining >= 0
      ? `今日剩余热量：${day.kcalRemaining} kcal`
      : `今日已超出目标：${-day.kcalRemaining} kcal`,
  );
  lines.push(
    day.proteinRemaining > 0
      ? `蛋白质还差：${Math.round(day.proteinRemaining)} g`
      : `蛋白质已达标（超出 ${Math.round(-day.proteinRemaining)} g）`,
  );

  lines.push("", "【最近 14 天（不含今天）】");
  if (recent.loggedDays === 0) lines.push("没有饮食记录。");
  else {
    lines.push(`有记录 ${recent.loggedDays} 天，日均 ${recent.avgKcal} kcal，日均蛋白质 ${recent.avgProteinG} g`);
    lines.push(recent.days.map((d) => `${d.date.slice(5)}: ${d.kcal}kcal/${Math.round(d.proteinG)}g蛋白`).join("，"));
    lines.push("注意：某天的记录可能不完整（漏记），数值明显偏低的日子不代表真的吃得少。");
  }

  lines.push("", "【体重】");
  if (weight.latestKg === null) lines.push("最近 45 天没有体重记录。");
  else {
    lines.push(`最新：${weight.latestKg} kg（${weight.latestDate}）`);
    lines.push(`近 7 日平均：${fmt(weight.avg7Kg, " kg")}；再往前 7 日平均：${fmt(weight.prevAvg7Kg, " kg")}`);
    lines.push(
      weight.trend30PerWeek === null
        ? "近 30 天趋势：数据不足，无法判断"
        : `近 30 天趋势：每周 ${weight.trend30PerWeek > 0 ? "+" : ""}${weight.trend30PerWeek} kg`,
    );
  }
  if (s.bodyFat) lines.push(`体脂率：${s.bodyFat.value}%（${s.bodyFat.date}）`);
  if (s.waist) lines.push(`腰围：${s.waist.value} cm（${s.waist.date}）`);
  return lines.join("\n");
}
