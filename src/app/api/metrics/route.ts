import { api } from "@/lib/http";
import { addMetric, metricInput } from "@/services/metrics";

export const POST = api({ body: metricInput }, ({ user, body }) => ({ id: addMetric(user, body) }));
