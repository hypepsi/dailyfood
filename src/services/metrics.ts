import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { BodyMetric, User } from "@/db/schema";
import type { BodyReport } from "@/lib/ai/read-body-report";
import { badRequest, notFound } from "@/lib/errors";
import { isDateString, localParts, zonedToUtc } from "@/lib/time";
import type { DailyValue } from "@/lib/weight";

const { bodyMetrics } = schema;

const optional = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);

export const metricInput = z.object({
  date: z.string().refine(isDateString).optional(),
  weightKg: optional(20, 400),
  bodyFatPct: optional(2, 75),
  waistCm: optional(30, 250),
  muscleKg: optional(5, 200),
  skeletalMuscleKg: optional(5, 150),
  visceralFat: optional(1, 60),
  bmrKcal: optional(500, 6000),
  note: z.string().trim().max(200).nullable().default(null),
});
export type MetricInput = z.infer<typeof metricInput>;

export const METRIC_FIELDS = [
  "weightKg",
  "bodyFatPct",
  "waistCm",
  "muscleKg",
  "skeletalMuscleKg",
  "visceralFat",
  "bmrKcal",
] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

export function addMetric(user: User, input: MetricInput): number {
  if (METRIC_FIELDS.every((f) => input[f] === null)) throw badRequest("至少填写一项数据");
  const now = Date.now();
  const local = localParts(now, user.timezone);
  const date = input.date ?? local.date;
  if (date > local.date) throw badRequest("不能记录未来的日期");
  const measuredAt = date === local.date ? now : zonedToUtc(date, "08:00", user.timezone);
  const { date: _omit, note, ...numbers } = input;
  // 统一保留两位小数，避免浮点误差进库
  const values = Object.fromEntries(
    Object.entries(numbers).map(([k, v]) => [k, v === null ? null : Math.round(v * 100) / 100]),
  ) as typeof numbers;
  return getDb()
    .insert(bodyMetrics)
    .values({ ...values, note, userId: user.id, localDate: date, measuredAt, createdAt: now })
    .returning({ id: bodyMetrics.id })
    .get().id;
}

/**
 * 保存从体脂秤报告识别出的数据。
 * 以报告上的测量日期为准；同一天已有记录时用这份报告覆盖，重复上传不会产生重复数据。
 */
export function recordReport(user: User, report: BodyReport): { id: number; date: string; replaced: boolean } {
  const now = Date.now();
  const local = localParts(now, user.timezone);
  const date = report.date && report.date <= local.date ? report.date : local.date;
  const measuredAt = date === local.date ? now : zonedToUtc(date, "08:00", user.timezone);
  const sameDay = and(eq(bodyMetrics.userId, user.id), eq(bodyMetrics.localDate, date));
  return getDb().transaction((tx) => {
    const replaced = tx.delete(bodyMetrics).where(sameDay).run().changes > 0;
    const row = tx
      .insert(bodyMetrics)
      .values({
        ...report.core,
        userId: user.id,
        localDate: date,
        measuredAt,
        source: "report",
        extra: Object.keys(report.extra).length ? JSON.stringify(report.extra) : null,
        createdAt: now,
      })
      .returning({ id: bodyMetrics.id })
      .get();
    return { id: row.id, date, replaced };
  });
}

export function deleteMetric(user: User, id: number) {
  const result = getDb()
    .delete(bodyMetrics)
    .where(and(eq(bodyMetrics.id, id), eq(bodyMetrics.userId, user.id)))
    .run();
  if (result.changes === 0) throw notFound();
}

export function listMetrics(user: User, limit = 60): BodyMetric[] {
  return getDb()
    .select()
    .from(bodyMetrics)
    .where(eq(bodyMetrics.userId, user.id))
    .orderBy(desc(bodyMetrics.measuredAt))
    .limit(limit)
    .all();
}

/** 某项指标的每日序列；同一天多次测量取最后一次 */
export function getDailySeries(user: User, field: MetricField, from?: string, to?: string): DailyValue[] {
  const column = bodyMetrics[field];
  const rows = getDb()
    .select({ date: bodyMetrics.localDate, value: column })
    .from(bodyMetrics)
    .where(
      and(
        eq(bodyMetrics.userId, user.id),
        isNotNull(column),
        from ? gte(bodyMetrics.localDate, from) : undefined,
        to ? lte(bodyMetrics.localDate, to) : undefined,
      ),
    )
    .orderBy(asc(bodyMetrics.measuredAt))
    .all();
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, r.value as number);
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

/** 某项指标的最新一条记录 */
export function getLatest(user: User, field: MetricField): { value: number; date: string } | null {
  const column = bodyMetrics[field];
  const row = getDb()
    .select({ value: column, date: bodyMetrics.localDate })
    .from(bodyMetrics)
    .where(and(eq(bodyMetrics.userId, user.id), isNotNull(column)))
    .orderBy(desc(bodyMetrics.measuredAt))
    .limit(1)
    .get();
  return row ? { value: row.value as number, date: row.date } : null;
}
