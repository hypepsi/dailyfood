import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { writeDailyAdvice } from "@/lib/ai/advisor";
import { buildSnapshot } from "./snapshot";

const { dailyAdvice } = schema;

/**
 * 今日简短建议。只在今天有已确认的饮食时生成；
 * 以当天饮食内容的哈希做缓存，数据没变就不重复调用模型。
 */
export async function getDailyAdvice(user: User): Promise<string | null> {
  const db = getDb();
  const snapshot = buildSnapshot(user);
  if (snapshot.day.meals.length === 0) return null;
  const dataHash = createHash("sha1")
    .update(JSON.stringify([snapshot.day.goals, snapshot.deficit?.day.burn, snapshot.day.meals.map((m) => [m.id, m.updatedAt, m.totals.kcal])]))
    .digest("hex");
  const where = and(eq(dailyAdvice.userId, user.id), eq(dailyAdvice.localDate, snapshot.date));
  const cached = db.select().from(dailyAdvice).where(where).get();
  if (cached?.dataHash === dataHash) return cached.content;

  const content = await writeDailyAdvice(user, snapshot);
  db.transaction((tx) => {
    tx.delete(dailyAdvice).where(where).run();
    tx.insert(dailyAdvice)
      .values({ userId: user.id, localDate: snapshot.date, dataHash, content, createdAt: Date.now() })
      .run();
  });
  return content;
}
