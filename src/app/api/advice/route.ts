import { api } from "@/lib/http";
import { getDailyAdvice } from "@/services/assistant";

export const maxDuration = 90;

export const GET = api({}, async ({ user }) => ({ advice: await getDailyAdvice(user) }));
