import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api } from "@/lib/http";

/**
 * 某个时间之后新建的草稿。识别其实已经完成、但结果没传回手机时，
 * 手机端用它找到那份草稿，直接跳过去，不用一直干等。
 */
export const GET = api({}, async ({ req, user }) => {
  const since = Number(req.nextUrl.searchParams.get("since"));
  if (!Number.isFinite(since) || since <= 0) return { id: null };
  const { meals } = schema;
  const row = getDb()
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, user.id), eq(meals.status, "draft"), gte(meals.createdAt, since)))
    .orderBy(desc(meals.createdAt))
    .get();
  return { id: row?.id ?? null };
});
