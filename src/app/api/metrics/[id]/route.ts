import { api, idParam } from "@/lib/http";
import { deleteMetric } from "@/services/metrics";

export const DELETE = api({}, ({ user, params }) => {
  deleteMetric(user, idParam(params.id));
});
