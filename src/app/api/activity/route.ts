import { badRequest } from "@/lib/errors";
import { api } from "@/lib/http";
import { isDateString } from "@/lib/time";
import { activityInput, clearActivity, setActivity } from "@/services/activity";

export const PUT = api({ body: activityInput }, ({ user, body }) => {
  setActivity(user, body);
});

export const DELETE = api({}, ({ req, user }) => {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!isDateString(date)) throw badRequest("日期不正确");
  clearActivity(user, date);
});
