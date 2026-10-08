import { api } from "@/lib/http";
import { syncPlan } from "@/services/plan";
import { profileInput, updateProfile } from "@/services/profile";

export const PUT = api({ body: profileInput }, ({ user, body }) => {
  updateProfile(user, body);
  // 节奏、活动水平、身高这些变了，每天该吃多少也要跟着重新算
  return { plan: syncPlan(user.id) };
});
