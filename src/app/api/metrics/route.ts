import { api } from "@/lib/http";
import { addMetric, metricInput } from "@/services/metrics";
import { syncPlan } from "@/services/plan";

export const POST = api({ body: metricInput }, ({ user, body }) => {
  const id = addMetric(user, body);
  return { id, plan: syncPlan(user.id) };
});
