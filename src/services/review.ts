import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { currentModel } from "@/lib/ai/client";
import { writeReview, type Review } from "@/lib/ai/review";
import { deficitTier, fatGrams } from "@/lib/energy";
import { AppError } from "@/lib/errors";
import { ACTIVITY } from "@/lib/goals";
import { MEAL_LABELS } from "@/lib/nutrition";
import { addDays, dateRange, formatDateCn, localParts } from "@/lib/time";
import { windowAverage } from "@/lib/weight";
import { getActivities } from "./activity";
import { getConfirmedMeals, type MealWithItems } from "./meals";
import { getDailySeries } from "./metrics";
import { goalsForDate } from "./profile";
import { getDeficitSummary, getEnergy, type DeficitDay } from "./snapshot";

const { weeklyReviews } = schema;

export const REVIEW_DAYS = 7;

export type ReviewWindow = {
  start: string;
  end: string;
  /** 窗口里的每一天，以及这一天有没有饮食记录 */
  days: { date: string; logged: boolean }[];
  loggedDays: number;
  /** 7 天都有记录才能复盘 */
  ready: boolean;
};

/**
 * 分析窗口：最近 7 个完整的自然日，到昨天为止，不含今天。
 * 今天还没过完，算进来会让平均值和热量差失真。
 */
export function getReviewWindow(user: User, now = Date.now()): ReviewWindow {
  const today = localParts(now, user.timezone).date;
  const end = addDays(today, -1);
  const start = addDays(end, -(REVIEW_DAYS - 1));
  const days = dateRange(start, end).map((date) => ({ date, logged: getConfirmedMeals(user, date).length > 0 }));
  const loggedDays = days.filter((d) => d.logged).length;
  return { start, end, days, loggedDays, ready: loggedDays === REVIEW_DAYS };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : 0);
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

/**
 * 把这 7 天的全部记录和统计渲染成给模型看的文本。
 * 所有合计、平均、占比、对比都在这里由程序算好，模型只负责分析和表达。
 */
export function renderReviewData(user: User, window: ReviewWindow, now = Date.now()): string {
  const { start, end } = window;
  const dates = window.days.map((d) => d.date);
  const mealsByDate = new Map<string, MealWithItems[]>(dates.map((d) => [d, getConfirmedMeals(user, d)]));
  const allMeals = [...mealsByDate.values()].flat();
  const deficit = getDeficitSummary(user, end, now);
  const deficitByDate = new Map<string, DeficitDay>((deficit?.days ?? []).map((d) => [d.date, d]));
  const activities = getActivities(user, start, end);
  const { energy, facts } = getEnergy(user, end);
  const goals = goalsForDate(user, end);
  const timeOf = (ts: number) => localParts(ts, user.timezone);

  const dayTotals = dates.map((date) => {
    const meals = mealsByDate.get(date)!;
    const sum = (pick: (m: MealWithItems) => number) => Math.round(meals.reduce((s, m) => s + pick(m), 0));
    return { date, kcal: sum((m) => m.totals.kcal), protein: sum((m) => m.totals.proteinG), carbs: sum((m) => m.totals.carbsG), fat: sum((m) => m.totals.fatG) };
  });

  const lines: string[] = [];
  lines.push(`复盘区间：${start} 至 ${end}（共 ${REVIEW_DAYS} 天，每天都有饮食记录）`);
  lines.push(
    `用户：${user.sex === "male" ? "男" : user.sex === "female" ? "女" : "性别未填"}，${facts.age ?? "年龄未填"} 岁，身高 ${user.heightCm ?? "未填"} cm；活动水平：${ACTIVITY[user.activityLevel].label}`,
  );
  lines.push(`目标：每日 ${goals.calorieTarget} kcal、蛋白质 ${goals.proteinTargetG} g，目标体重 ${goals.targetWeightKg ?? "未设"} kg`);
  if (energy) lines.push(`基础代谢约 ${energy.bmr} kcal（${energy.bmrSource}）；没有手表数据的日子按每日消耗 ${energy.tdee} kcal 估算`);

  lines.push("", "【每天的明细】");
  for (const t of dayTotals) {
    const d = deficitByDate.get(t.date);
    const watch = activities.get(t.date);
    lines.push(
      `■ ${t.date} ${formatDateCn(t.date).split(" ")[1]}：摄入 ${t.kcal} kcal（蛋白质 ${t.protein} g，碳水 ${t.carbs} g，脂肪 ${t.fat} g）` +
        (d ? `；消耗 ${d.burn} kcal（${watch ? `手表运动消耗 ${watch.kcal}` : "估算"}）；热量差 ${signed(d.deficit)}，档位「${deficitTier(d.deficit).label}」` : ""),
    );
    for (const m of mealsByDate.get(t.date)!) {
      const items = m.items
        .map((i) => `${i.name}${i.quantity ? `(${i.quantity})` : ""}${i.eatenFraction !== 1 ? `[实际吃了${Math.round(i.eatenFraction * 100)}%]` : ""}`)
        .join("、");
      const notes = [m.sharePeople > 1 ? `${m.sharePeople}人分食，热量已按本人一份计` : "", m.source === "manual" ? "手动记录" : ""].filter(Boolean).join("，");
      lines.push(`  - ${MEAL_LABELS[m.mealType]} ${timeOf(m.eatenAt).time}：${m.totals.kcal} kcal，蛋白质 ${Math.round(m.totals.proteinG)} g —— ${items}${notes ? `（${notes}）` : ""}`);
    }
  }

  // ---- 以下全部是程序算好的统计 ----
  const kcals = dayTotals.map((d) => d.kcal);
  const totalKcal = kcals.reduce((s, v) => s + v, 0);
  const sumOf = (pick: (d: (typeof dayTotals)[number]) => number) => dayTotals.reduce((s, d) => s + pick(d), 0);
  const maxDay = dayTotals.reduce((a, b) => (b.kcal > a.kcal ? b : a));
  const minDay = dayTotals.reduce((a, b) => (b.kcal < a.kcal ? b : a));
  lines.push("", "【热量与营养素统计】");
  lines.push(`日均摄入 ${avg(kcals)} kcal（目标 ${goals.calorieTarget}，日均差 ${signed(avg(kcals) - goals.calorieTarget)}）；超过目标 ${kcals.filter((k) => k > goals.calorieTarget).length} 天`);
  lines.push(`最高 ${maxDay.date} ${maxDay.kcal} kcal，最低 ${minDay.date} ${minDay.kcal} kcal，相差 ${maxDay.kcal - minDay.kcal}`);
  lines.push(
    `日均蛋白质 ${avg(dayTotals.map((d) => d.protein))} g（目标 ${goals.proteinTargetG}），达标 ${dayTotals.filter((d) => d.protein >= goals.proteinTargetG).length} 天；日均碳水 ${avg(dayTotals.map((d) => d.carbs))} g，脂肪 ${avg(dayTotals.map((d) => d.fat))} g`,
  );
  const macroKcal = sumOf((d) => d.protein * 4) + sumOf((d) => d.carbs * 4) + sumOf((d) => d.fat * 9);
  lines.push(`三大营养素供能比：蛋白质 ${pct(sumOf((d) => d.protein * 4), macroKcal)}%，碳水 ${pct(sumOf((d) => d.carbs * 4), macroKcal)}%，脂肪 ${pct(sumOf((d) => d.fat * 9), macroKcal)}%`);

  const counted = dates.map((d) => deficitByDate.get(d)).filter((d): d is DeficitDay => !!d);
  if (counted.length) {
    const total = counted.reduce((s, d) => s + d.deficit, 0);
    const tiers = new Map<string, number>();
    for (const d of counted) tiers.set(deficitTier(d.deficit).label, (tiers.get(deficitTier(d.deficit).label) ?? 0) + 1);
    lines.push("", "【热量差统计】");
    lines.push(`7 天累计热量差 ${signed(total)} kcal，折合脂肪约 ${fatGrams(total)} g；日均 ${signed(Math.round(total / counted.length))}`);
    lines.push(`档位分布：${[...tiers.entries()].map(([label, n]) => `${label} ${n} 天`).join("，")}`);
    lines.push(`按这个累计热量差，理论上体重应变化约 ${(-total / 7700).toFixed(2)} kg（前提是记录完整）`);
  }

  lines.push("", "【进餐规律统计】");
  for (const type of ["breakfast", "lunch", "dinner", "snack"] as const) {
    const list = allMeals.filter((m) => m.mealType === type);
    const daysWith = dates.filter((d) => mealsByDate.get(d)!.some((m) => m.mealType === type)).length;
    const kcal = list.reduce((s, m) => s + m.totals.kcal, 0);
    lines.push(`${MEAL_LABELS[type]}：${daysWith} 天有记录，共 ${list.length} 次，平均每次 ${list.length ? Math.round(kcal / list.length) : 0} kcal，占总摄入 ${pct(kcal, totalKcal)}%`);
  }
  const late = allMeals.filter((m) => timeOf(m.eatenAt).hour >= 21 || timeOf(m.eatenAt).hour < 4);
  lines.push(`21 点以后进食 ${late.length} 次，共 ${late.reduce((s, m) => s + m.totals.kcal, 0)} kcal`);

  const eaten = allMeals
    .flatMap((m) => m.items.map((i) => ({ name: i.name, date: m.localDate, kcal: Math.round((i.kcal * i.eatenFraction) / (i.personal ? 1 : m.sharePeople)) })))
    .sort((a, b) => b.kcal - a.kcal);
  lines.push("", "【本人实际摄入热量最高的 8 样食物】");
  lines.push(eaten.slice(0, 8).map((i) => `${i.name}（${i.date.slice(5)}，${i.kcal} kcal）`).join("；"));

  lines.push("", "【运动消耗】");
  const watchDays = dates.filter((d) => activities.has(d));
  lines.push(
    watchDays.length
      ? `${watchDays.length} 天录入了手表数据，平均运动消耗 ${avg(watchDays.map((d) => activities.get(d)!.kcal))} kcal/天：${watchDays.map((d) => `${d.slice(5)} ${activities.get(d)!.kcal}`).join("，")}`
      : "这 7 天都没有录入手表数据，消耗全部按活动水平估算，热量差的可信度相应较低。",
  );

  lines.push("", "【体重与身体数据】");
  const weights = getDailySeries(user, "weightKg", addDays(start, -7), end);
  const inWindow = weights.filter((w) => w.date >= start);
  if (inWindow.length === 0) lines.push("这 7 天没有称重。");
  else lines.push(`这 7 天称重 ${inWindow.length} 次：${inWindow.map((w) => `${w.date.slice(5)} ${w.value} kg`).join("，")}`);
  const thisAvg = windowAverage(weights, end, 7);
  const prevAvg = windowAverage(weights, addDays(start, -1), 7);
  if (thisAvg !== null && prevAvg !== null) lines.push(`这 7 天平均体重 ${thisAvg} kg，前 7 天平均 ${prevAvg} kg，变化 ${signed(Math.round((thisAvg - prevAvg) * 100) / 100)} kg`);
  else lines.push("称重次数不够，无法比较这一周和上一周的平均体重。");
  const bodyFat = getDailySeries(user, "bodyFatPct", undefined, end);
  if (bodyFat.length) lines.push(`最近的体脂率记录：${bodyFat.slice(-3).map((b) => `${b.date} ${b.value}%`).join("，")}`);

  lines.push("", "【记录方式】");
  const corrected = allMeals.filter((m) => m.items.some((i) => i.eatenFraction !== 1)).length;
  lines.push(`共记录 ${allMeals.length} 顿：其中 ${allMeals.filter((m) => m.sharePeople > 1).length} 顿是多人分食，${corrected} 顿做过“没吃完”修正，${allMeals.filter((m) => m.source === "manual").length} 顿是手动填写`);
  return lines.join("\n");
}

export type StoredReview = { id: number; startDate: string; endDate: string; createdAt: number; review: Review; stale: boolean };

function parseStored(row: typeof weeklyReviews.$inferSelect, currentHash?: string): StoredReview {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    review: JSON.parse(row.content) as Review,
    stale: currentHash !== undefined && row.dataHash !== currentHash,
  };
}

const hashOf = (data: string) => createHash("sha1").update(data).digest("hex");

/** 当前窗口已经生成过的复盘；stale 表示生成之后数据又变过 */
export function getCurrentReview(user: User, window: ReviewWindow, now = Date.now()): StoredReview | null {
  const row = getDb()
    .select()
    .from(weeklyReviews)
    .where(and(eq(weeklyReviews.userId, user.id), eq(weeklyReviews.endDate, window.end)))
    .get();
  if (!row) return null;
  return parseStored(row, window.ready ? hashOf(renderReviewData(user, window, now)) : undefined);
}

export function listPastReviews(user: User, beforeEnd: string, limit = 12): StoredReview[] {
  return getDb()
    .select()
    .from(weeklyReviews)
    .where(eq(weeklyReviews.userId, user.id))
    .orderBy(desc(weeklyReviews.endDate))
    .limit(limit + 1)
    .all()
    .filter((r) => r.endDate !== beforeEnd)
    .slice(0, limit)
    .map((r) => parseStored(r));
}

/** 生成（或在数据变化后重新生成）当前窗口的复盘 */
export async function generateReview(user: User, now = Date.now()): Promise<StoredReview> {
  const window = getReviewWindow(user, now);
  if (!window.ready) {
    throw new AppError(409, "not_enough_data", `最近 ${REVIEW_DAYS} 天都有饮食记录才能生成分析，目前 ${window.loggedDays} / ${REVIEW_DAYS} 天`);
  }
  const data = renderReviewData(user, window, now);
  const dataHash = hashOf(data);
  const db = getDb();
  const where = and(eq(weeklyReviews.userId, user.id), eq(weeklyReviews.endDate, window.end));
  const existing = db.select().from(weeklyReviews).where(where).get();
  if (existing?.dataHash === dataHash) return parseStored(existing, dataHash);

  const review = await writeReview(user, data);
  const row = db.transaction((tx) => {
    tx.delete(weeklyReviews).where(where).run();
    return tx
      .insert(weeklyReviews)
      .values({ userId: user.id, startDate: window.start, endDate: window.end, dataHash, content: JSON.stringify(review), model: currentModel(), createdAt: Date.now() })
      .returning()
      .get();
  });
  return parseStored(row, dataHash);
}
