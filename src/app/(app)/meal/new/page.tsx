import { DescribeMeal } from "@/components/DescribeMeal";
import { MealEditor } from "@/components/MealEditor";
import { PageHeader } from "@/components/PageHeader";
import { guessMealType } from "@/lib/nutrition";
import { requireUser } from "@/lib/session";
import { isDateString, localParts } from "@/lib/time";
import { mealTypeOf } from "@/services/meals";

export default async function NewMealPage({ searchParams }: { searchParams: Promise<{ date?: string; type?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const now = localParts(Date.now(), user.timezone);
  const date = query.date && isDateString(query.date) && query.date <= now.date ? query.date : now.date;
  const isToday = date === now.date;
  const mealType = mealTypeOf(query.type ?? "") ?? (isToday ? guessMealType(now.hour, now.minute) : "lunch");

  return (
    <>
      <PageHeader title="手动记录" backHref={isToday ? "/" : `/day/${date}`} />
      <div className="space-y-4">
        <DescribeMeal date={date} isToday={isToday} />
        <p className="pt-2 text-center text-sm text-faint">或者自己填写</p>
        <MealEditor mode="new" today={now.date} initial={{ mealType, date, time: isToday ? now.time : "12:00", people: 1, items: [] }} />
      </div>
    </>
  );
}
