import { and, asc, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { ACTIVITY_LEVELS, type User } from "@/db/schema";
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
  // 下限是为了不让系统帮助极端节食
  calorieTarget: z.number().int().min(1200).max(6000),
  proteinTargetG: z.number().int().min(20).max(400),
  targetWeightKg: z.number().min(30).max(300).nullable(),
});
export type ProfileInput = z.infer<typeof profileInput>;

/** 目标历史里表示“从一开始”的日期 */
const EPOCH_DATE = "0000-01-01";

export type Goals = { calorieTarget: number; proteinTargetG: number; targetWeightKg: number | null };

export function updateProfile(user: User, input: ProfileInput) {
  const db = getDb();
  const now = Date.now();
  const goalsChanged =
    input.calorieTarget !== user.calorieTarget ||
    input.proteinTargetG !== user.proteinTargetG ||
    input.targetWeightKg !== user.targetWeightKg;
  db.transaction((tx) => {
    tx.update(users).set({ ...input, updatedAt: now }).where(eq(users.id, user.id)).run();
    if (goalsChanged) {
      const effectiveDate = localDate(now, input.timezone);
      // 第一次改目标时，先把旧目标存成“从一开始就生效”的一条，否则过去的日子会被新目标重新评价
      const hasHistory = tx.select({ id: goalHistory.id }).from(goalHistory).where(eq(goalHistory.userId, user.id)).limit(1).get();
      if (!hasHistory) {
        tx.insert(goalHistory)
          .values({
            userId: user.id,
            effectiveDate: EPOCH_DATE,
            calorieTarget: user.calorieTarget,
            proteinTargetG: user.proteinTargetG,
            targetWeightKg: user.targetWeightKg,
            createdAt: now,
          })
          .run();
      }
      // 同一天多次修改只保留最后一次
      tx.delete(goalHistory)
        .where(and(eq(goalHistory.userId, user.id), eq(goalHistory.effectiveDate, effectiveDate)))
        .run();
      tx.insert(goalHistory)
        .values({
          userId: user.id,
          effectiveDate,
          calorieTarget: input.calorieTarget,
          proteinTargetG: input.proteinTargetG,
          targetWeightKg: input.targetWeightKg,
          createdAt: now,
        })
        .run();
    }
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
