import { ListChecks, NotebookText, Sparkles } from "lucide-react";
import type { Review } from "@/lib/ai/review";
import type { ReviewNumbers } from "@/services/review";
import { Card } from "./Card";

const signedKg = (kg: number) => `${kg > 0 ? "+" : kg < 0 ? "−" : ""}${Math.abs(kg).toFixed(1)} kg`;

/** 这 7 天的几个关键数字（程序算的），放在 AI 总结上面 */
function Numbers({ n }: { n: ReviewNumbers }) {
  const cells = [
    { label: "平均每天吃", value: `${n.avgIntake} kcal` },
    { label: "平均每天缺口", value: n.avgDeficit === null ? "—" : `${n.avgDeficit} kcal` },
    { label: "按缺口算该变", value: n.expectedKg === null ? "—" : signedKg(n.expectedKg) },
    { label: "体重实际变了", value: n.actualKg === null ? "称得不够" : signedKg(n.actualKg) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {cells.map((c) => (
        <div key={c.label}>
          <dt className="text-xs font-medium text-muted">{c.label}</dt>
          <dd className="num mt-0.5 text-base font-bold">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 一份 7 天总结：一句话 → 关键数字 → 几句话的情况 → 接下来做什么 */
export function ReviewView({ review, numbers }: { review: Review; numbers: ReviewNumbers | null }) {
  return (
    <>
      <section className="card-tint flex gap-2.5">
        <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
        <p className="font-semibold leading-relaxed">{review.headline}</p>
      </section>

      <Card icon={NotebookText} title="这周的情况">
        {numbers && (
          <div className="mb-4 border-b border-line pb-4">
            <Numbers n={numbers} />
          </div>
        )}
        <p className="leading-relaxed">{review.summary}</p>
      </Card>

      <Card icon={ListChecks} title="接下来">
        <ol className="divide-y divide-line">
          {review.nextSteps.map((step, i) => (
            <li key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">{i + 1}</span>
              <span className="font-medium leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
