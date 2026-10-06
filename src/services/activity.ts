import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ACTIVITY_KINDS, type User } from "@/db/schema";
import { badRequest } from "@/lib/errors";
import type { ActivityEntry } from "@/lib/energy";
import { isDateString, localDate } from "@/lib/time";

const { activityLogs } = schema;

export const activityInput = z.object({
  date: z.string().refine(isDateString).optional(),
  kcal: z.number().int().min(0).max(10000),
  kind: z.enum(ACTIVITY_KINDS),
});

/** 录入或更新某天的手表消耗；同一天以最后一次为准 */
export function setActivity(user: User, input: z.infer<typeof activityInput>) {
  const today = localDate(Date.now(), user.timezone);
  const date = input.date ?? today;
  if (date > today) throw badRequest("不能记录未来的日期");
  const now = Date.now();
  getDb()
    .insert(activityLogs)
    .values({ userId: user.id, localDate: date, kcal: input.kcal, kind: input.kind, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [activityLogs.userId, activityLogs.localDate], set: { kcal: input.kcal, kind: input.kind, updatedAt: now } })
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
  return new Map(rows.map((r) => [r.localDate, { kcal: r.kcal, kind: r.kind }]));
}

/** 用户最近一次用的是哪种口径，作为输入框的默认值 */
export function lastActivityKind(user: User) {
  const rows = [...getActivities(user).entries()].sort((a, b) => b[0].localeCompare(a[0]));
  return rows[0]?.[1].kind ?? "active";
}
