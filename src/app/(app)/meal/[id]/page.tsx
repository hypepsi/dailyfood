import { notFound } from "next/navigation";
import { MealEditor, type EditorItem } from "@/components/MealEditor";
import { PageHeader } from "@/components/PageHeader";
import type { MealEstimate } from "@/lib/ai/analyze-meal";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { localParts } from "@/lib/time";
import { getMeal, todayFor, type MealWithItems } from "@/services/meals";

function readAiRecord(meal: MealWithItems): { estimate: MealEstimate | null; text: string | null } {
  if (!meal.aiEstimate) return { estimate: null, text: null };
  try {
    const record = JSON.parse(meal.aiEstimate) as { estimate?: MealEstimate; text?: string | null };
    return { estimate: record.estimate ?? null, text: record.text ?? null };
  } catch {
    return { estimate: null, text: null };
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
  const { estimate, text: described } = readAiRecord(meal);
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
    eatenFraction: item.eatenFraction,
    // 置信度只在确认草稿时有意义，此时明细与 AI 结果一一对应
    confidence: isDraft ? estimate?.items[i]?.confidence : undefined,
  }));

  return (
    <>
      <PageHeader title={isDraft ? "确认这顿饭" : "修改记录"} backHref={meal.localDate === today ? "/" : `/day/${meal.localDate}`} />
      {described && (
        <p className="mb-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm leading-relaxed text-muted">
          <span className="text-faint">{meal.source === "voice" ? "听到的是：" : "你的描述："}</span>
          {described}
        </p>
      )}
      <MealEditor
        key={meal.updatedAt}
        mode={isDraft ? "draft" : "edit"}
        mealId={meal.id}
        photoCount={meal.photoCount}
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
