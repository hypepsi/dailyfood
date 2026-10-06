import { DayView } from "@/components/DayView";
import { requireUser } from "@/lib/session";
import { todayFor } from "@/services/meals";

export default async function HomePage() {
  const user = await requireUser();
  const today = todayFor(user);
  return <DayView user={user} date={today} today={today} />;
}
