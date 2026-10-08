import { api, idParam } from "@/lib/http";
import { deleteMetric } from "@/services/metrics";
import { syncPlan } from "@/services/plan";

export const DELETE = api({}, ({ user, params }) => {
  deleteMetric(user, idParam(params.id));
  syncPlan(user.id);
});
