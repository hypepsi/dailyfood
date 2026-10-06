import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { badRequest } from "@/lib/errors";
import type { ActivityEntry } from "@/lib/energy";
import { isDateString, localDate } from "@/lib/time";

const { activityLogs } = schema;

export const activityInput = z.object({
  date: z.string().refine(isDateString).optional(),
  kcal: z.number().int().min(0).max(10000),
});

/** 录入或更新某天手表上的运动消耗；同一天以最后一次为准 */
export function setActivity(user: User, input: z.infer<typeof activityInput>) {
  const today = localDate(Date.now(), user.timezone);
  const date = input.date ?? today;
  if (date > today) throw badRequest("不能记录未来的日期");
  const now = Date.now();
  getDb()
    .insert(activityLogs)
    .values({ userId: user.id, localDate: date, kcal: input.kcal, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [activityLogs.userId, activityLogs.localDate], set: { kcal: input.kcal, updatedAt: now } })
    .run();
}

/** 删除后这一天退回到按活动水平估算 */
export function clearActivity(user: User, date: string) {
  getDb().delete(activityLogs).where(and(eq(activityLogs.userId, user.id), eq(activityLogs.localDate, date))).run();
}

export function getActivities(user: User, from?: string, to?: string): Map<string, ActivityEntry> {
  const rows = getDb()
    .select()
    .from(activityLogs)
    .where(and(eq(activityLogs.userId, user.id), from ? gte(activityLogs.localDate, from) : undefined, to ? lte(activityLogs.localDate, to) : undefined))
    .all();
  return new Map(rows.map((r) => [r.localDate, { kcal: r.kcal }]));
}
