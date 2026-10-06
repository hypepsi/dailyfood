import Link from "next/link";
import { Plus } from "lucide-react";
import { MEAL_TYPES } from "@/db/schema";
import { MEAL_LABELS } from "@/lib/nutrition";
import type { MealWithItems } from "@/services/meals";

/** 早餐 / 午餐 / 晚餐 / 加餐 四栏，每栏列出已记录的饮食 */
export function MealList({ meals, date, timezone }: { meals: MealWithItems[]; date: string; timezone: string }) {
  const timeFmt = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (
    <div className="divide-y divide-line">
      {MEAL_TYPES.map((type) => {
        const list = meals.filter((m) => m.mealType === type);
        const kcal = list.reduce((s, m) => s + m.totals.kcal, 0);
        return (
          <div key={type} className="py-2.5 first:pt-0 last:pb-0 lg:py-4">
            <div className="flex items-center">
              <h3 className="flex-1 text-[15px] font-semibold">{MEAL_LABELS[type]}</h3>
              {list.length > 0 ? (
                <span className="num text-sm text-muted">{kcal} kcal</span>
              ) : (
                <span className="text-sm text-faint">未记录</span>
              )}
              <Link
                href={`/meal/new?date=${date}&type=${type}`}
                aria-label={`添加${MEAL_LABELS[type]}`}
                className="-mr-2 ml-1 flex h-8 w-8 items-center justify-center rounded-full text-faint active:bg-line"
              >
                <Plus size={16} />
              </Link>
            </div>
            {list.map((meal) => (
              <Link key={meal.id} href={`/meal/${meal.id}`} className="mt-1.5 flex items-center gap-2.5 rounded-xl p-0.5 lg:mt-2 lg:gap-3 lg:hover:bg-bg active:bg-bg">
                {meal.thumbPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/meals/${meal.id}/image?size=thumb`}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-xl object-cover lg:h-14 lg:w-14"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 lg:h-14 lg:w-14 items-center justify-center rounded-xl bg-tint text-base font-semibold text-accent">
                    {(meal.title || MEAL_LABELS[type]).slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{meal.title || meal.items.map((i) => i.name).join("、")}</span>
                  <span className="num block text-[13px] text-faint">
                    {timeFmt.format(meal.eatenAt)} · 蛋白质 {Math.round(meal.totals.proteinG)} g
                    {meal.sharePeople > 1 && ` · ${meal.sharePeople} 人分食`}
                  </span>
                </span>
                <span className="num shrink-0 font-semibold">{meal.totals.kcal}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
