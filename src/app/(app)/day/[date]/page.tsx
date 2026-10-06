import { notFound, redirect } from "next/navigation";
import { DayView } from "@/components/DayView";
import { requireUser } from "@/lib/session";
import { isDateString } from "@/lib/time";
import { todayFor } from "@/services/meals";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isDateString(date)) notFound();
  const user = await requireUser();
  const today = todayFor(user);
  if (date >= today) redirect("/");
  return <DayView user={user} date={date} today={today} />;
}
