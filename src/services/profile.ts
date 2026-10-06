import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
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
  // 下限是为了不让系统帮助极端节食
  calorieTarget: z.number().int().min(1200).max(6000),
  proteinTargetG: z.number().int().min(20).max(400),
  targetWeightKg: z.number().min(30).max(300).nullable(),
});
export type ProfileInput = z.infer<typeof profileInput>;

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
  const source = row ?? user;
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
