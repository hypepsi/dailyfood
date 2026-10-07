import type { User } from "@/db/schema";
import { dailyCalorieTarget, dayBurn, fatGrams, loggingStreak, type ActivityEntry, type DayBurn } from "@/lib/energy";
import { ACTIVITY, estimateEnergy, type BodyFacts, type Energy } from "@/lib/goals";
import { MEAL_LABELS, round1, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { addDays, ageOn, localParts } from "@/lib/time";
import { trendPerWeek, windowAverage } from "@/lib/weight";
import { getConfirmedMeals, getDailyTotals, type MealWithItems } from "./meals";
import { getActivities } from "./activity";
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
  /** calorieTarget 是当天实际使用的目标（运动多的日子已上调） */
  goals: Goals;
  /** 用户设的基础目标，以及因为手表运动消耗上调了多少 */
  baseCalorieTarget: number;
  activityBonus: number;
  meals: MealWithItems[];
  totals: Nutrients;
  kcalRemaining: number;
  proteinRemaining: number;
};

/** 某一天实际使用的目标：用户当时设的目标 + 运动多时的上调 */
export function goalsOn(user: User, date: string, energy: Energy | null, activity: ActivityEntry | null) {
  const base = goalsForDate(user, date);
  const { target, bonus } = dailyCalorieTarget(base.calorieTarget, energy, activity);
  return { goals: { ...base, calorieTarget: target }, baseCalorieTarget: base.calorieTarget, activityBonus: bonus };
}

export function getDaySummary(user: User, date: string, now = Date.now()): DaySummary {
  const { energy } = getEnergy(user, localParts(now, user.timezone).date);
  const effective = goalsOn(user, date, energy, getActivities(user, date, date).get(date) ?? null);
  const meals = getConfirmedMeals(user, date);
  const totals = sumNutrients(meals.map((m) => m.totals));
  return {
    date,
    ...effective,
    meals,
    totals,
    kcalRemaining: effective.goals.calorieTarget - totals.kcal,
    proteinRemaining: round1(effective.goals.proteinTargetG - totals.proteinG),
  };
}

export function getWeightStats(user: User, date: string): WeightStats {
  const series = getDailySeries(user, "weightKg", addDays(date, -44), date);
  // 趋势只看最近 45 天；“最新体重”不受这个窗口限制，很久没称也要能显示上一次的
  const latest = series.at(-1) ?? getDailySeries(user, "weightKg", undefined, date).at(-1) ?? null;
  return {
    latestKg: latest?.value ?? null,
    latestDate: latest?.date ?? null,
    avg7Kg: windowAverage(series, date, 7),
    prevAvg7Kg: windowAverage(series, addDays(date, -7), 7),
    trend30PerWeek: trendPerWeek(series, date, 30),
  };
}

/** 用户当前的身体参数，以及由此算出的基础代谢和按活动水平估算的每日消耗 */
export function getEnergy(user: User, date: string, weight = getWeightStats(user, date)) {
  const bodyFat = getLatest(user, "bodyFatPct");
  const measuredBmr = getLatest(user, "bmrKcal");
  const facts: BodyFacts = {
    sex: user.sex,
    age: user.birthDate ? ageOn(user.birthDate, date) : null,
    heightCm: user.heightCm,
    weightKg: weight.avg7Kg ?? weight.latestKg ?? getLatest(user, "weightKg")?.value ?? null,
    bodyFatPct: bodyFat?.value ?? null,
    measuredBmr: measuredBmr?.value ?? null,
    activityLevel: user.activityLevel,
    targetWeightKg: user.targetWeightKg,
  };
  return { facts, energy: estimateEnergy(facts), bodyFat };
}

/** 没记晚餐时，到几点就认为今天吃完了。定得晚一些：晚饭吃得晚、记得晚都很常见 */
const SETTLED_HOUR = 22;

export type DeficitDay = DayBurn & { date: string; intake: number; deficit: number };

/**
 * 热量差（消耗 − 摄入）汇总，全部由程序计算。
 * 累计值只统计有饮食记录的日子：没记录的日子不知道吃了多少，不能当成全是缺口。
 */
export function getDeficitSummary(user: User, date: string, now = Date.now()) {
  const local = localParts(now, user.timezone);
  const { energy } = getEnergy(user, local.date);
  if (!energy) return null;

  const activities = getActivities(user);
  const { goals } = goalsOn(user, date, energy, activities.get(date) ?? null);
  const intakeByDate = new Map(getDailyTotals(user, "0000-01-01", local.date).map((d) => [d.date, d.kcal]));
  const dayOf = (d: string): DeficitDay => {
    const burn = dayBurn(energy, activities.get(d) ?? null);
    const intake = intakeByDate.get(d) ?? 0;
    return { ...burn, date: d, intake, deficit: burn.burn - intake };
  };

  const day = dayOf(date);
  const isToday = date === local.date;
  const dinnerLogged = isToday && getConfirmedMeals(user, date).some((m) => m.mealType === "dinner");
  const settled = !isToday || local.hour >= SETTLED_HOUR || dinnerLogged;
  // 今天还没吃完时，今天的“热量差”只是进行中的数字，不能算进累计
  const lastCounted = settled ? date : addDays(date, -1);
  const logged = [...intakeByDate.keys()].filter((d) => d <= lastCounted).map(dayOf);
  const weekStart = addDays(date, -6);
  const week = logged.filter((d) => d.date >= weekStart);
  const sum = (days: DeficitDay[]) => days.reduce((s, d) => s + d.deficit, 0);

  return {
    day,
    /** 这一天有没有饮食记录；没有记录就不知道吃了多少，不能把全部消耗当成热量差 */
    hasRecords: intakeByDate.has(date),
    /** 这一天算不算“吃完了”：过去的日子、今天 22 点以后、或已经记了晚餐 */
    settled,
    /** 如果今天正好吃到（已按运动上调的）目标，热量差会是多少 */
    deficitAtTarget: day.burn - goals.calorieTarget,
    week: { days: week.length, total: sum(week) },
    allTime: { days: logged.length, total: sum(logged) },
    /** 每个计入累计的日子（有饮食记录、且已经吃完），按日期升序，供趋势图使用 */
    days: logged.sort((a, b) => a.date.localeCompare(b.date)),
    streak: loggingStreak(new Set(intakeByDate.keys()), local.date, (d) => addDays(d, -1)),
  };
}

export type DeficitSummary = NonNullable<ReturnType<typeof getDeficitSummary>>;

/**
 * 交给 AI 的数据快照：全部来自数据库，全部由程序算好。
 * AI 只负责解释和建议，不负责回忆和计算。
 */
export function buildSnapshot(user: User, now = Date.now()) {
  const local = localParts(now, user.timezone);
  const day = getDaySummary(user, local.date, now);
  const recentDays = getDailyTotals(user, addDays(local.date, -14), addDays(local.date, -1));
  const weight = getWeightStats(user, local.date);
  const waist = getLatest(user, "waistCm");
  const { facts, energy, bodyFat } = getEnergy(user, local.date, weight);
  const deficit = getDeficitSummary(user, local.date, now);
  const avg = (pick: (d: Nutrients) => number) =>
    recentDays.length ? Math.round(recentDays.reduce((s, d) => s + pick(d), 0) / recentDays.length) : null;

  return {
    date: local.date,
    time: local.time,
    timezone: user.timezone,
    profile: { name: user.displayName, sex: user.sex, age: facts.age, heightCm: user.heightCm },
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
    facts,
    energy,
    deficit,
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
    `目标：每日热量 ${day.baseCalorieTarget} kcal，每日蛋白质 ${day.goals.proteinTargetG} g，目标体重 ${fmt(day.goals.targetWeightKg, "kg")}`,
  );
  if (s.energy) {
    lines.push(
      `基础代谢：约 ${s.energy.bmr} kcal（${s.energy.bmrSource}）；没有手表数据的日子按活动水平估算每日消耗约 ${s.energy.tdee} kcal（${ACTIVITY[s.facts.activityLevel].label}）`,
    );
  }
  if (s.deficit) {
    const d = s.deficit;
    lines.push(
      d.day.source === "watch"
        ? `今天的消耗：${d.day.burn} kcal（基础代谢 ${d.day.bmr} + 用户从手表录入的运动消耗 ${d.day.active}；一天没过完时这个数还会涨）`
        : `今天的消耗：约 ${d.day.burn} kcal（今天没有录入手表数据，按活动水平估算）`,
    );
    if (day.activityBonus > 0) {
      lines.push(
        `今天运动消耗高于平时，今日热量目标已由 ${day.baseCalorieTarget} 上调到 ${day.goals.calorieTarget} kcal（+${day.activityBonus}），这样热量差保持在计划的水平。下面的“剩余热量”按上调后的目标计算；建议用户把这部分吃回来，不要硬扛。`,
      );
    }
    lines.push(
      d.hasRecords
        ? `今天的热量差（消耗 − 已摄入）：${d.day.deficit} kcal${d.settled ? "" : "（今天还没吃完，这个数会随着进食变小）"}；如果正好吃到目标，热量差约 ${d.deficitAtTarget} kcal`
        : `今天还没有饮食记录，暂不计算热量差；如果正好吃到目标，热量差约 ${d.deficitAtTarget} kcal`,
    );
    if (d.week.days > 0) {
      lines.push(
        `近 7 天有记录的 ${d.week.days} 天累计热量差：${d.week.total} kcal，折合脂肪约 ${fatGrams(d.week.total)} g${d.settled ? "" : "（不含还没吃完的今天）"}`,
      );
    }
    lines.push(`连续记录天数：${d.streak}`);
  }

  lines.push("", "【今天已确认的饮食】");
  if (day.meals.length === 0) lines.push("今天还没有任何记录。");
  for (const m of day.meals) {
    const time = localParts(m.eatenAt, s.timezone).time;
    const items = m.items.map((i) => `${i.name}${i.quantity ? ` ${i.quantity}` : ""}`).join("；");
    const shared = m.sharePeople > 1 ? `；${m.sharePeople} 人分食，以下数字已是用户本人的一份` : "";
    lines.push(`- ${MEAL_LABELS[m.mealType]} ${time}：${m.totals.kcal} kcal，蛋白质 ${Math.round(m.totals.proteinG)} g（${items}${shared}）`);
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
  if (weight.latestKg === null) lines.push("还没有体重记录。");
  else {
    lines.push(`最新：${weight.latestKg} kg（${weight.latestDate}）`);
    if (weight.avg7Kg === null) lines.push("最近 7 天没有称重，上面是最后一次的记录，可能已经过时。");
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
