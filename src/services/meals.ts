import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { MEAL_TYPES, type Meal, type MealItem, type MealType, type User } from "@/db/schema";
import { AppError, notFound } from "@/lib/errors";
import { removeImages } from "@/lib/images";
import { guessMealType, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { isDateString, isTimeString, localDate, localParts, zonedToUtc } from "@/lib/time";

const { meals, mealItems } = schema;

const grams = z.number().min(0).max(1000);

export const itemInput = z.object({
  name: z.string().trim().min(1).max(60),
  quantity: z.string().trim().max(30).default(""),
  weightG: z.number().min(0).max(5000).nullable().default(null),
  kcal: z.number().min(0).max(10000),
  proteinG: grams.default(0),
  carbsG: grams.default(0),
  fatG: grams.default(0),
  personal: z.boolean().default(false),
});
export type ItemInput = z.infer<typeof itemInput>;

export const mealInput = z.object({
  mealType: z.enum(MEAL_TYPES),
  date: z.string().refine(isDateString),
  time: z.string().refine(isTimeString),
  title: z.string().trim().max(60).default(""),
  /** 几个人一起吃；1 表示自己一个人吃 */
  people: z.number().int().min(1).max(20).default(1),
  items: z.array(itemInput).min(1).max(30),
});
export type MealInput = z.infer<typeof mealInput>;

export type MealWithItems = Meal & { items: MealItem[]; totals: Nutrients };

/** 明细按整桌保存；多人分食时合吃的项目 ÷ 人数，自己单独吃的项目全算，由程序计算 */
function withTotals(meal: Meal, items: MealItem[]): MealWithItems {
  const mine = items.map((i) => {
    const share = i.personal ? 1 : 1 / meal.sharePeople;
    return { kcal: i.kcal * share, proteinG: i.proteinG * share, carbsG: i.carbsG * share, fatG: i.fatG * share };
  });
  return { ...meal, items, totals: sumNutrients(mine) };
}

function replaceItems(tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0], mealId: number, items: ItemInput[]) {
  tx.delete(mealItems).where(eq(mealItems.mealId, mealId)).run();
  tx.insert(mealItems)
    .values(items.map((item, position) => ({ ...item, mealId, position })))
    .run();
}

function titleFor(input: { title: string; items: ItemInput[] }): string {
  if (input.title) return input.title;
  return input.items
    .slice(0, 3)
    .map((i) => i.name)
    .join("、")
    .slice(0, 60);
}

/** AI 识别结果先存为草稿，不计入统计，等用户确认 */
export function createDraft(
  user: User,
  draft: {
    source: "photo" | "text";
    title: string;
    items: ItemInput[];
    aiEstimate: unknown;
    aiModel: string;
    imagePath?: string;
    thumbPath?: string;
    /** 补记过去某天时指定日期 */
    date?: string;
  },
): number {
  const db = getDb();
  const now = Date.now();
  const local = localParts(now, user.timezone);
  const backdated = draft.date && draft.date !== local.date ? draft.date : null;
  const eatenAt = backdated ? zonedToUtc(backdated, "12:00", user.timezone) : now;
  return db.transaction((tx) => {
    const meal = tx
      .insert(meals)
      .values({
        userId: user.id,
        localDate: backdated ?? local.date,
        eatenAt,
        mealType: backdated ? "lunch" : guessMealType(local.hour, local.minute),
        status: "draft",
        source: draft.source,
        title: draft.title.slice(0, 60),
        imagePath: draft.imagePath,
        thumbPath: draft.thumbPath,
        aiEstimate: JSON.stringify(draft.aiEstimate),
        aiModel: draft.aiModel,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: meals.id })
      .get();
    replaceItems(tx, meal.id, draft.items);
    return meal.id;
  });
}

/** 追问回答后，用新的识别结果替换草稿内容 */
export function replaceDraftEstimate(
  user: User,
  mealId: number,
  update: { title: string; items: ItemInput[]; aiEstimate: unknown },
) {
  const db = getDb();
  const meal = getMealRow(user, mealId);
  if (meal.status !== "draft") throw new AppError(409, "not_draft", "这顿饭已经确认，无法重新识别");
  db.transaction((tx) => {
    tx.update(meals)
      .set({ title: update.title.slice(0, 60), aiEstimate: JSON.stringify(update.aiEstimate), updatedAt: Date.now() })
      .where(eq(meals.id, mealId))
      .run();
    replaceItems(tx, mealId, update.items);
  });
}

/** 纯手动记录，直接确认 */
export function createManualMeal(user: User, input: MealInput): number {
  const db = getDb();
  const now = Date.now();
  return db.transaction((tx) => {
    const meal = tx
      .insert(meals)
      .values({
        userId: user.id,
        localDate: input.date,
        eatenAt: zonedToUtc(input.date, input.time, user.timezone),
        mealType: input.mealType,
        sharePeople: input.people,
        status: "confirmed",
        source: "manual",
        title: titleFor(input),
        createdAt: now,
        updatedAt: now,
        confirmedAt: now,
      })
      .returning({ id: meals.id })
      .get();
    replaceItems(tx, meal.id, input.items);
    return meal.id;
  });
}

/** 确认草稿，或修改已确认的记录。保存的永远是用户最终值 */
export function saveMeal(user: User, mealId: number, input: MealInput) {
  const db = getDb();
  const meal = getMealRow(user, mealId);
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(meals)
      .set({
        mealType: input.mealType,
        sharePeople: input.people,
        localDate: input.date,
        eatenAt: zonedToUtc(input.date, input.time, user.timezone),
        // 用户没改标题时保留原来的（例如 AI 起的名字）
        title: input.title || meal.title || titleFor(input),
        status: "confirmed",
        confirmedAt: meal.confirmedAt ?? now,
        updatedAt: now,
      })
      .where(eq(meals.id, mealId))
      .run();
    replaceItems(tx, mealId, input.items);
  });
}

export async function deleteMeal(user: User, mealId: number) {
  const meal = getMealRow(user, mealId);
  getDb().delete(meals).where(eq(meals.id, mealId)).run();
  await removeImages(meal.imagePath, meal.thumbPath);
}

/** 所有按 id 的访问都带 user_id 条件，用户之间互相不可见 */
export function getMealRow(user: User, mealId: number): Meal {
  const meal = getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, user.id)))
    .get();
  if (!meal) throw notFound("这顿饭");
  return meal;
}

export function getMeal(user: User, mealId: number): MealWithItems {
  const meal = getMealRow(user, mealId);
  const items = getDb()
    .select()
    .from(mealItems)
    .where(eq(mealItems.mealId, mealId))
    .orderBy(asc(mealItems.position))
    .all();
  return withTotals(meal, items);
}

export function getConfirmedMeals(user: User, date: string): MealWithItems[] {
  const db = getDb();
  const rows = db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.localDate, date), eq(meals.status, "confirmed")))
    .orderBy(asc(meals.eatenAt))
    .all();
  if (rows.length === 0) return [];
  const items = db
    .select()
    .from(mealItems)
    .where(inArray(mealItems.mealId, rows.map((m) => m.id)))
    .orderBy(asc(mealItems.position))
    .all();
  return rows.map((m) => withTotals(m, items.filter((i) => i.mealId === m.id)));
}

/** 未确认的草稿（最近 24 小时），首页提示用户继续确认 */
export function getPendingDrafts(user: User): Meal[] {
  return getDb()
    .select()
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.status, "draft"), gte(meals.createdAt, Date.now() - 86400_000)))
    .orderBy(desc(meals.createdAt))
    .all();
}

export type DayTotals = Nutrients & { date: string; mealCount: number };

/** from..to 每个有记录日期的合计，只统计已确认的饮食 */
export function getDailyTotals(user: User, from: string, to: string): DayTotals[] {
  const divisor = sql`(case when ${mealItems.personal} then 1 else ${meals.sharePeople} end)`;
  const rows = getDb()
    .select({
      date: meals.localDate,
      kcal: sql<number>`coalesce(sum(${mealItems.kcal} * 1.0 / ${divisor}), 0)`,
      proteinG: sql<number>`coalesce(sum(${mealItems.proteinG} * 1.0 / ${divisor}), 0)`,
      carbsG: sql<number>`coalesce(sum(${mealItems.carbsG} * 1.0 / ${divisor}), 0)`,
      fatG: sql<number>`coalesce(sum(${mealItems.fatG} * 1.0 / ${divisor}), 0)`,
      mealCount: sql<number>`count(distinct ${meals.id})`,
    })
    .from(meals)
    .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
    .where(
      and(eq(meals.userId, user.id), eq(meals.status, "confirmed"), gte(meals.localDate, from), lte(meals.localDate, to)),
    )
    .groupBy(meals.localDate)
    .orderBy(asc(meals.localDate))
    .all();
  return rows.map((r) => ({ date: r.date, mealCount: r.mealCount, ...sumNutrients([r]) }));
}

export function getFirstMealDate(user: User): string | null {
  const row = getDb()
    .select({ date: sql<string | null>`min(${meals.localDate})` })
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.status, "confirmed")))
    .get();
  return row?.date ?? null;
}

/** 清理超过 24 小时仍未确认的草稿，返回需要删除的图片 */
export function purgeStaleDrafts(olderThanMs = 86400_000): string[] {
  const db = getDb();
  const cutoff = Date.now() - olderThanMs;
  const stale = db
    .select()
    .from(meals)
    .where(and(eq(meals.status, "draft"), lt(meals.createdAt, cutoff)))
    .all();
  if (stale.length === 0) return [];
  db.delete(meals).where(inArray(meals.id, stale.map((m) => m.id))).run();
  return stale.flatMap((m) => [m.imagePath, m.thumbPath]).filter((p): p is string => !!p);
}

export function mealTypeOf(value: string): MealType | null {
  return (MEAL_TYPES as readonly string[]).includes(value) ? (value as MealType) : null;
}

export const todayFor = (user: User) => localDate(Date.now(), user.timezone);
