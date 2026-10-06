import { api, idParam } from "@/lib/http";
import { deleteMeal, mealInput, saveMeal } from "@/services/meals";

/** 确认草稿或修改已有记录 */
export const PUT = api({ body: mealInput }, ({ user, body, params }) => {
  saveMeal(user, idParam(params.id), body);
});

export const DELETE = api({}, async ({ user, params }) => {
  await deleteMeal(user, idParam(params.id));
});
