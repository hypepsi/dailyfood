import { createHash } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { answerChat, writeDailyAdvice } from "@/lib/ai/advisor";
import { buildSnapshot } from "./snapshot";

const { chatMessages, dailyAdvice } = schema;

/** 带入模型的历史轮数：只为了让对话连贯，饮食数据一律来自快照 */
const HISTORY_FOR_MODEL = 10;

export function listChatMessages(user: User, limit = 60, beforeId?: number) {
  return getDb()
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, user.id), beforeId ? lt(chatMessages.id, beforeId) : undefined))
    .orderBy(desc(chatMessages.id))
    .limit(limit)
    .all()
    .reverse();
}

export async function sendChatMessage(user: User, message: string) {
  const db = getDb();
  const history = listChatMessages(user, HISTORY_FOR_MODEL).map(({ role, content }) => ({ role, content }));
  const snapshot = buildSnapshot(user);
  const reply = await answerChat(user, snapshot, history, message);
  const now = Date.now();
  return db.transaction((tx) => {
    tx.insert(chatMessages).values({ userId: user.id, role: "user", content: message, createdAt: now }).run();
    return tx
      .insert(chatMessages)
      .values({ userId: user.id, role: "assistant", content: reply, createdAt: now + 1 })
      .returning({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, createdAt: chatMessages.createdAt })
      .get();
  });
}

export function clearChat(user: User) {
  getDb().delete(chatMessages).where(eq(chatMessages.userId, user.id)).run();
}

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
