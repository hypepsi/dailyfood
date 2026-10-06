import { api } from "@/lib/http";
import { createManualMeal, mealInput } from "@/services/meals";

export const POST = api({ body: mealInput }, ({ user, body }) => ({ id: createManualMeal(user, body) }));
