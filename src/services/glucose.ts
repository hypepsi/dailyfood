import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { writeGlucoseReview, type GlucoseReview } from "@/lib/ai/glucose";
import { MEAL_LABELS } from "@/lib/nutrition";
import { localParts } from "@/lib/time";
import { getConfirmedMeals, type MealWithItems } from "./meals";

const { glucoseReviews } = schema;

/** 到了这个时间，即使三餐没记全也开始盘点 */
export const GLUCOSE_HOUR = 21;
export const GLUCOSE_MINUTE = 30;

export type GlucoseStatus = {
  /** 三餐各记了没有，用于没到时间时显示进度 */
  logged: { breakfast: boolean; lunch: boolean; dinner: boolean };
  ready: boolean;
};

/** 三餐都记了，或者到了晚上 9:30（且至少记了一顿），就可以盘点 */
export function glucoseStatus(meals: MealWithItems[], isToday: boolean, now: number, tz: string): GlucoseStatus {
  const has = (t: string) => meals.some((m) => m.mealType === t);
  const logged = { breakfast: has("breakfast"), lunch: has("lunch"), dinner: has("dinner") };
  const { hour, minute } = localParts(now, tz) as { hour: number; minute: number };
  const late = hour > GLUCOSE_HOUR || (hour === GLUCOSE_HOUR && minute >= GLUCOSE_MINUTE);
  const ready = meals.length > 0 && (!isToday || late || (logged.breakfast && logged.lunch && logged.dinner));
  return { logged, ready };
}

const round = (n: number) => Math.round(n);

/** 交给 AI 的当天饮食：每样食物按实际吃进去的量（× 吃掉的比例，合吃的 ÷ 人数） */
export function renderGlucoseData(meals: MealWithItems[], tz: string): string {
  return meals
    .map((m, n) => {
      const time = localParts(m.eatenAt, tz).time;
      // 饭后马上吃的加餐，血糖上要跟上一顿一起看，把间隔写给 AI
      const gap = n > 0 ? Math.round((m.eatenAt - meals[n - 1].eatenAt) / 60_000) : null;
      const after = m.mealType === "snack" && gap !== null && gap <= 60 ? `（紧接着上一顿，相隔 ${gap} 分钟）` : "";
      const items = m.items.map((i) => {
        const f = i.eatenFraction / (i.personal ? 1 : Math.max(m.sharePeople, 1));
        const qty = [i.quantity, i.weightG ? `约${round(i.weightG * f)}g` : ""].filter(Boolean).join("，");
        return `  - ${i.name}（${qty}）：${round(i.kcal * f)} kcal，碳水 ${round(i.carbsG * f)} g，蛋白质 ${round(i.proteinG * f)} g，脂肪 ${round(i.fatG * f)} g`;
      });
      return [`${MEAL_LABELS[m.mealType]} ${time}${after}，合计 ${m.totals.kcal} kcal，碳水 ${round(m.totals.carbsG)} g`, ...items].join("\n");
    })
    .join("\n");
}

function hashOf(meals: MealWithItems[]): string {
  return createHash("sha1")
    .update(JSON.stringify(meals.map((m) => [m.id, m.updatedAt, m.totals.kcal])))
    .digest("hex");
}

function stored(user: User, date: string) {
  return getDb()
    .select()
    .from(glucoseReviews)
    .where(and(eq(glucoseReviews.userId, user.id), eq(glucoseReviews.localDate, date)))
    .get();
}

/** 看过去某天时只显示当时生成过的，不为翻历史再去调用 AI */
export function getStoredGlucose(user: User, date: string): GlucoseReview | null {
  const row = stored(user, date);
  return row ? (JSON.parse(row.content) as GlucoseReview) : null;
}

/**
 * 当天的盘点：条件满足才生成；以当天饮食的哈希缓存，记录没变就不重复调用模型，
 * 改了或补记了某顿，下次打开会重新盘点。
 */
export async function getGlucoseReview(user: User, date: string, now = Date.now()): Promise<{ status: GlucoseStatus; review: GlucoseReview | null }> {
  const meals = getConfirmedMeals(user, date);
  const isToday = localParts(now, user.timezone).date === date;
  const status = glucoseStatus(meals, isToday, now, user.timezone);
  if (!status.ready) return { status, review: null };

  const dataHash = hashOf(meals);
  const cached = stored(user, date);
  if (cached?.dataHash === dataHash) return { status, review: JSON.parse(cached.content) as GlucoseReview };

  const review = await writeGlucoseReview(user, renderGlucoseData(meals, user.timezone));
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(glucoseReviews).where(and(eq(glucoseReviews.userId, user.id), eq(glucoseReviews.localDate, date))).run();
    tx.insert(glucoseReviews).values({ userId: user.id, localDate: date, dataHash, content: JSON.stringify(review), createdAt: Date.now() }).run();
  });
  return { status, review };
}
