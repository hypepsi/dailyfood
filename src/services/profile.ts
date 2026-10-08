import { and, asc, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ACTIVITY_LEVELS, ESTIMATE_STYLES, GOAL_PACES, type User } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth-password";
import { badRequest } from "@/lib/errors";
import { isDateString, localDate } from "@/lib/time";

const { users, goalHistory, sessions } = schema;

function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const profileInput = z.object({
  displayName: z.string().trim().min(1).max(30),
  sex: z.enum(["male", "female"]).nullable(),
  birthDate: z.string().refine(isDateString).nullable(),
  heightCm: z.number().min(80).max(250).nullable(),
  timezone: z.string().refine(isTimezone),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  estimateStyle: z.enum(ESTIMATE_STYLES),
  goalPace: z.enum(GOAL_PACES),
  /** 想减到（或增到）的体重，可以不填；只用来显示进度，不参与计算每天吃多少 */
  targetWeightKg: z.number().min(30).max(300).nullable(),
});
export type ProfileInput = z.infer<typeof profileInput>;

/** 目标历史里表示“从一开始”的日期 */
const EPOCH_DATE = "0000-01-01";

export type Goals = { calorieTarget: number; proteinTargetG: number; targetWeightKg: number | null };

/** 保存资料。每日热量和蛋白质不在这里填：它们由节奏和身体数据算出来，见 services/plan.ts */
export function updateProfile(user: User, input: ProfileInput) {
  getDb().update(users).set({ ...input, updatedAt: Date.now() }).where(eq(users.id, user.id)).run();
}

/**
 * 写入新的每日目标，并记进目标历史：过去的日子仍按当时的目标评价。
 * 同一天多次变化只保留最后一次。
 */
export function setGoals(user: User, goals: { calorieTarget: number; proteinTargetG: number }) {
  const db = getDb();
  const now = Date.now();
  const effectiveDate = localDate(now, user.timezone);
  db.transaction((tx) => {
    tx.update(users).set({ ...goals, updatedAt: now }).where(eq(users.id, user.id)).run();
    // 第一次变化时，先把旧目标存成“从一开始就生效”的一条，否则过去的日子会被新目标重新评价
    const hasHistory = tx.select({ id: goalHistory.id }).from(goalHistory).where(eq(goalHistory.userId, user.id)).limit(1).get();
    if (!hasHistory) {
      tx.insert(goalHistory)
        .values({ userId: user.id, effectiveDate: EPOCH_DATE, calorieTarget: user.calorieTarget, proteinTargetG: user.proteinTargetG, targetWeightKg: user.targetWeightKg, createdAt: now })
        .run();
    }
    tx.delete(goalHistory)
      .where(and(eq(goalHistory.userId, user.id), eq(goalHistory.effectiveDate, effectiveDate)))
      .run();
    tx.insert(goalHistory)
      .values({ userId: user.id, effectiveDate, ...goals, targetWeightKg: user.targetWeightKg, createdAt: now })
      .run();
  });
}

/** 某一天生效的目标：过去的日子按当时的目标评价，而不是现在的 */
export function goalsForDate(user: User, date: string): Goals {
  const row = getDb()
    .select()
    .from(goalHistory)
    .where(and(eq(goalHistory.userId, user.id), lte(goalHistory.effectiveDate, date)))
    .orderBy(desc(goalHistory.effectiveDate))
    .limit(1)
    .get();
  // 早于第一条历史的日子，用最早的那条；完全没有历史（从没改过目标）才用当前目标
  const earliest = row
    ? null
    : getDb().select().from(goalHistory).where(eq(goalHistory.userId, user.id)).orderBy(asc(goalHistory.effectiveDate)).limit(1).get();
  const source = row ?? earliest ?? user;
  return {
    calorieTarget: source.calorieTarget,
    proteinTargetG: source.proteinTargetG,
    targetWeightKg: source.targetWeightKg,
  };
}

export const passwordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export function changePassword(user: User, input: z.infer<typeof passwordInput>) {
  if (!verifyPassword(input.currentPassword, user.passwordHash)) throw badRequest("当前密码不正确");
  getDb()
    .update(users)
    .set({ passwordHash: hashPassword(input.newPassword), updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();
  // 改密码后所有设备下线
  getDb().delete(sessions).where(eq(sessions.userId, user.id)).run();
}
