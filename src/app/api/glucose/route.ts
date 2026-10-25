import { api } from "@/lib/http";
import { localParts } from "@/lib/time";
import { getGlucoseReview } from "@/services/glucose";

export const maxDuration = 90;

/** 今天的血糖盘点；条件没满足时 review 为 null */
export const GET = api({}, async ({ user }) => {
  const { review } = await getGlucoseReview(user, localParts(Date.now(), user.timezone).date);
  return { review };
});
