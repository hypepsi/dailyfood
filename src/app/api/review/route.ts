import { api } from "@/lib/http";
import { generateReview } from "@/services/review";

export const maxDuration = 120;

/** 生成最近 7 天的复盘；数据没变时直接返回已有的那份 */
export const POST = api({}, async ({ user }) => {
  const stored = await generateReview(user);
  return { id: stored.id };
});
