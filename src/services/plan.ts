import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { recommendGoals } from "@/lib/goals";
import { localDate } from "@/lib/time";
import { setGoals } from "./profile";
import { getEnergy } from "./snapshot";

export type PlanChange = { calorieTarget: number; proteinTargetG: number };

/** 身体数据变化引起的小幅波动不改目标：热量差不到 100、蛋白质差不到 10 g 时保持原样 */
const MIN_KCAL_CHANGE = 100;
const MIN_PROTEIN_CHANGE = 10;

/**
 * 让每日目标跟上最新情况：用户选的节奏 + 最新的身体数据 → 每天该吃多少热量和蛋白质。
 * - 用户自己改了节奏、活动水平等（force）：立刻按新结果来。
 * - 只是称了体重、传了报告：变化够大才改，免得目标随着每次称重在 1900 和 1950 之间来回跳。
 * - 第一次算出来的时候（还没有任何目标历史）总是采用。
 * 目标有变化时写入并返回新目标；没变化、变化太小或资料不全时返回 null。
 */
export function syncPlan(userId: number, options: { force?: boolean } = {}): PlanChange | null {
  const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return null;
  const { facts } = getEnergy(user, localDate(Date.now(), user.timezone));
  const rec = recommendGoals(facts, user.goalPace);
  if (!rec) return null;
  const kcalDiff = Math.abs(rec.calorieTarget - user.calorieTarget);
  const proteinDiff = Math.abs(rec.proteinTargetG - user.proteinTargetG);
  if (kcalDiff === 0 && proteinDiff === 0) return null;
  const firstTime = !getDb().select({ id: schema.goalHistory.id }).from(schema.goalHistory).where(eq(schema.goalHistory.userId, userId)).limit(1).get();
  if (!options.force && !firstTime && kcalDiff < MIN_KCAL_CHANGE && proteinDiff < MIN_PROTEIN_CHANGE) return null;
  const goals = { calorieTarget: rec.calorieTarget, proteinTargetG: rec.proteinTargetG };
  setGoals(user as User, goals);
  return goals;
}
