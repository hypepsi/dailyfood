import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { MAX_MEAL_PHOTOS, MEAL_TYPES, type Meal, type MealItem, type MealType, type User } from "@/db/schema";
import { AppError, badRequest, notFound } from "@/lib/errors";
import { removeImages, type StoredImage } from "@/lib/images";
import { guessMealType, sumNutrients, type Nutrients } from "@/lib/nutrition";
import { isDateString, isTimeString, localDate, localParts, zonedToUtc } from "@/lib/time";

const { meals, mealItems, mealImages } = schema;

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
  eatenFraction: z.number().min(0).max(3).default(1),
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

export type MealWithItems = Meal & { items: MealItem[]; totals: Nutrients; photoCount: number };

/**
 * 明细保存的是原始份量。计入统计的量由程序计算：
 * × 实际吃掉的比例（修正），合吃的项目再 ÷ 人数，自己单独吃的项目不分摊。
 */
function withTotals(meal: Meal, items: MealItem[], photoCount: number): MealWithItems {
  const mine = items.map((i) => {
    const share = i.eatenFraction * (i.personal ? 1 : 1 / meal.sharePeople);
    return { kcal: i.kcal * share, proteinG: i.proteinG * share, carbsG: i.carbsG * share, fatG: i.fatG * share };
  });
  return { ...meal, items, totals: sumNutrients(mine), photoCount };
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
    source: "photo" | "text" | "voice";
    /** 用户在描述里明确说出的人数和餐次，优先于默认值 */
    people?: number | null;
    mealType?: MealType | null;
    title: string;
    items: ItemInput[];
    aiEstimate: unknown;
    aiModel: string;
    /** 这顿饭的照片，按拍摄顺序 */
    images?: Pick<StoredImage, "imagePath" | "thumbPath">[];
    /** 补记过去某天时指定日期 */
    date?: string;
  },
): number {
  const db = getDb();
  const now = Date.now();
  const local = localParts(now, user.timezone);
  // 只接受过去的日期；今天或未来一律按“现在”记
  const backdated = draft.date && draft.date < local.date ? draft.date : null;
  const eatenAt = backdated ? zonedToUtc(backdated, "12:00", user.timezone) : now;
  return db.transaction((tx) => {
    const meal = tx
      .insert(meals)
      .values({
        userId: user.id,
        localDate: backdated ?? local.date,
        eatenAt,
        mealType: draft.mealType ?? (backdated ? "lunch" : guessMealType(local.hour, local.minute)),
        sharePeople: draft.people ?? 1,
        status: "draft",
        source: draft.source,
        title: draft.title.slice(0, 60),
        aiEstimate: JSON.stringify(draft.aiEstimate),
        aiModel: draft.aiModel,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: meals.id })
      .get();
    replaceItems(tx, meal.id, draft.items);
    (draft.images ?? []).forEach((image, position) => {
      tx.insert(mealImages).values({ mealId: meal.id, position, imagePath: image.imagePath, thumbPath: image.thumbPath, createdAt: now }).run();
    });
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

/** 界面上已经限制了日期，这里是服务端的最后一道检查 */
function assertNotFuture(user: User, date: string) {
  if (date > localDate(Date.now(), user.timezone)) throw badRequest("不能记录未来的日期");
}

/** 纯手动记录，直接确认 */
export function createManualMeal(user: User, input: MealInput): number {
  assertNotFuture(user, input.date);
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
  assertNotFuture(user, input.date);
  const db = getDb();
  const meal = getMealRow(user, mealId);
  const now = Date.now();
  // 名称要跟着内容走：食物种类没变才沿用原来的名称（例如 AI 起的名字）；
  // 改过、增删过食物而又没给新名称时，用现在的食物重新拼一个，否则首页会一直显示旧名字
  const before = db.select({ name: mealItems.name }).from(mealItems).where(eq(mealItems.mealId, mealId)).all();
  const names = (list: { name: string }[]) => list.map((i) => i.name.trim()).sort().join("|");
  const sameFoods = names(before) === names(input.items);
  db.transaction((tx) => {
    tx.update(meals)
      .set({
        mealType: input.mealType,
        sharePeople: input.people,
        localDate: input.date,
        eatenAt: zonedToUtc(input.date, input.time, user.timezone),
        title: input.title || (sameFoods ? meal.title : "") || titleFor(input),
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
  getMealRow(user, mealId);
  const images = getMealImages(mealId);
  getDb().delete(meals).where(eq(meals.id, mealId)).run();
  await removeImages(...images.flatMap((i) => [i.imagePath, i.thumbPath]));
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
  return withTotals(meal, items, getMealImages(mealId).length);
}

export function getMealImages(mealId: number) {
  return getDb().select().from(mealImages).where(eq(mealImages.mealId, mealId)).orderBy(asc(mealImages.position)).all();
}

/** 给一顿饭补一张照片；超过上限时拒绝 */
export function addMealImage(user: User, mealId: number, image: Pick<StoredImage, "imagePath" | "thumbPath">): number {
  getMealRow(user, mealId);
  const existing = getMealImages(mealId);
  if (existing.length >= MAX_MEAL_PHOTOS) throw new AppError(409, "too_many_photos", `一顿饭最多 ${MAX_MEAL_PHOTOS} 张照片`);
  const position = existing.length ? existing[existing.length - 1].position + 1 : 0;
  getDb().insert(mealImages).values({ mealId, position, imagePath: image.imagePath, thumbPath: image.thumbPath, createdAt: Date.now() }).run();
  return existing.length + 1;
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
  const photos = db
    .select({ mealId: mealImages.mealId, n: sql<number>`count(*)` })
    .from(mealImages)
    .where(inArray(mealImages.mealId, rows.map((m) => m.id)))
    .groupBy(mealImages.mealId)
    .all();
  const photoCount = new Map(photos.map((p) => [p.mealId, p.n]));
  return rows.map((m) => withTotals(m, items.filter((i) => i.mealId === m.id), photoCount.get(m.id) ?? 0));
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
      kcal: sql<number>`coalesce(sum(${mealItems.kcal} * ${mealItems.eatenFraction} / ${divisor}), 0)`,
      proteinG: sql<number>`coalesce(sum(${mealItems.proteinG} * ${mealItems.eatenFraction} / ${divisor}), 0)`,
      carbsG: sql<number>`coalesce(sum(${mealItems.carbsG} * ${mealItems.eatenFraction} / ${divisor}), 0)`,
      fatG: sql<number>`coalesce(sum(${mealItems.fatG} * ${mealItems.eatenFraction} / ${divisor}), 0)`,
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
  const ids = stale.map((m) => m.id);
  const images = db.select().from(mealImages).where(inArray(mealImages.mealId, ids)).all();
  db.delete(meals).where(inArray(meals.id, ids)).run();
  return images.flatMap((i) => [i.imagePath, i.thumbPath]).filter((p): p is string => !!p);
}

export function mealTypeOf(value: string): MealType | null {
  return (MEAL_TYPES as readonly string[]).includes(value) ? (value as MealType) : null;
}

export const todayFor = (user: User) => localDate(Date.now(), user.timezone);

export type TopFood = { name: string; kcal: number; times: number };

/** 同一样食物 AI 每次起的名字会略有不同（“水煮蛋”“水煮鸡蛋（2 个）”），去掉括号里的说明后再归并 */
const foodKey = (name: string) => name.replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, "").trim();

/**
 * 一段时间里，用户自己吃进去热量最多的几样食物。
 * 按“实际计入”的热量算：没吃完的按比例，合吃的按自己那一份。
 */
export function getTopFoods(user: User, from: string, to: string, limit = 10): { foods: TopFood[]; totalKcal: number } {
  const rows = getDb()
    .select({ name: mealItems.name, kcal: mealItems.kcal, eaten: mealItems.eatenFraction, personal: mealItems.personal, people: meals.sharePeople })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .where(and(eq(meals.userId, user.id), eq(meals.status, "confirmed"), gte(meals.localDate, from), lte(meals.localDate, to)))
    .all();
  const byFood = new Map<string, TopFood>();
  let totalKcal = 0;
  for (const r of rows) {
    const kcal = (r.kcal * r.eaten) / (r.personal ? 1 : r.people);
    totalKcal += kcal;
    const key = foodKey(r.name) || r.name;
    const entry = byFood.get(key) ?? { name: key, kcal: 0, times: 0 };
    entry.kcal += kcal;
    if (r.eaten > 0) entry.times += 1;
    byFood.set(key, entry);
  }
  const foods = [...byFood.values()]
    .filter((f) => f.kcal >= 1)
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit)
    .map((f) => ({ ...f, kcal: Math.round(f.kcal) }));
  return { foods, totalKcal: Math.round(totalKcal) };
}
