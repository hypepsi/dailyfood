import { notFound } from "next/navigation";
import { MealEditor, type EditorItem } from "@/components/MealEditor";
import { PageHeader } from "@/components/PageHeader";
import type { MealEstimate } from "@/lib/ai/analyze-meal";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { localParts } from "@/lib/time";
import { getMeal, todayFor, type MealWithItems } from "@/services/meals";

function readEstimate(meal: MealWithItems): MealEstimate | null {
  if (!meal.aiEstimate) return null;
  try {
    return (JSON.parse(meal.aiEstimate) as { estimate?: MealEstimate }).estimate ?? null;
  } catch {
    return null;
  }
}

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  let meal: MealWithItems;
  try {
    meal = getMeal(user, id);
  } catch (err) {
    if (err instanceof AppError) notFound();
    throw err;
  }

  const today = todayFor(user);
  const estimate = readEstimate(meal);
  const isDraft = meal.status === "draft";
  const items: EditorItem[] = meal.items.map((item, i) => ({
    name: item.name,
    quantity: item.quantity,
    weightG: item.weightG,
    kcal: item.kcal,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    personal: item.personal,
    // 置信度只在确认草稿时有意义，此时明细与 AI 结果一一对应
    confidence: isDraft ? estimate?.items[i]?.confidence : undefined,
  }));

  return (
    <>
      <PageHeader title={isDraft ? "确认这顿饭" : "修改记录"} backHref={meal.localDate === today ? "/" : `/day/${meal.localDate}`} />
      {meal.thumbPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/meals/${meal.id}/image`} alt="食物照片" className="mb-3 max-h-48 w-full rounded-3xl object-cover" />
      )}
      <MealEditor
        key={meal.updatedAt}
        mode={isDraft ? "draft" : "edit"}
        mealId={meal.id}
        today={today}
        initial={{ mealType: meal.mealType, date: meal.localDate, time: localParts(meal.eatenAt, user.timezone).time, people: meal.sharePeople, items }}
        estimate={
          estimate
            ? { totalKcal: estimate.totalKcal, kcalLow: estimate.kcalLow, kcalHigh: estimate.kcalHigh, note: estimate.note, peopleHint: estimate.peopleHint, questions: estimate.questions }
            : undefined
        }
      />
    </>
  );
}
