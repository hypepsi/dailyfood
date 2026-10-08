import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { recommendGoals } from "@/lib/goals";
import { localDate } from "@/lib/time";
import { setGoals } from "./profile";
import { getEnergy } from "./snapshot";

export type PlanChange = { calorieTarget: number; proteinTargetG: number };

/**
 * 让每日目标跟上最新情况：用户选的节奏 + 最新的身体数据 → 每天该吃多少热量和蛋白质。
 * 在节奏、活动水平、身高性别年龄或身体数据变化之后调用。
 * 目标有变化时写入并返回新目标；没变化、或资料不全算不出来时返回 null（保留原来的目标）。
 */
export function syncPlan(userId: number): PlanChange | null {
  const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!user) return null;
  const { facts } = getEnergy(user, localDate(Date.now(), user.timezone));
  const rec = recommendGoals(facts, user.goalPace);
  if (!rec) return null;
  if (rec.calorieTarget === user.calorieTarget && rec.proteinTargetG === user.proteinTargetG) return null;
  const goals = { calorieTarget: rec.calorieTarget, proteinTargetG: rec.proteinTargetG };
  setGoals(user as User, goals);
  return goals;
}
