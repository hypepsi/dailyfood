import { api } from "@/lib/http";
import { reviewStatus, startReview } from "@/services/review";

/** 开始生成最近 7 天的分析（在后台跑），立刻返回 */
export const POST = api({}, ({ user }) => {
  startReview(user);
  return reviewStatus(user.id);
});

/** 页面轮询：还在跑吗、上一次有没有出错 */
export const GET = api({}, ({ user }) => reviewStatus(user.id));
