import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  ClipboardList,
  Clock,
  Egg,
  Flame,
  ListChecks,
  Salad,
  Scale,
  Sparkles,
  ThumbsUp,
  TriangleAlert,
  Trophy,
  Watch,
  type LucideIcon,
} from "lucide-react";
import { DIMENSIONS, type DimensionKey, type Review, type Verdict } from "@/lib/ai/review";
import { Card } from "./Card";

const VERDICT: Record<Verdict, { label: string; className: string; icon: LucideIcon }> = {
  good: { label: "做得好", className: "bg-tint text-accent-deep", icon: CircleCheck },
  ok: { label: "还行", className: "bg-bg text-muted", icon: CircleMinus },
  attention: { label: "需注意", className: "bg-warn-tint text-warn", icon: CircleAlert },
};

/** 每个维度的图标，和首页同类卡片保持一致 */
const ICONS: Record<DimensionKey, LucideIcon> = {
  calories: Flame,
  protein: Egg,
  deficit: Trophy,
  food_quality: Salad,
  rhythm: Clock,
  weight: Scale,
  activity: Watch,
  logging: ClipboardList,
};

/** 一份分析的完整展示：一句话总结 → 下周三件事 → 做得好 / 要注意 → 八个维度。卡片样式与首页一致 */
export function ReviewView({ review }: { review: Review }) {
  return (
    <>
      <section className="card-tint flex gap-2.5">
        <Sparkles size={17} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-sm font-medium leading-relaxed">{review.headline}</p>
      </section>

      <Card icon={ListChecks} title="下周做这三件事">
        <ol className="divide-y divide-line">
          {review.nextWeek.map((action, i) => (
            <li key={i} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white">{i + 1}</span>
              <span className="font-medium leading-relaxed">{action}</span>
            </li>
          ))}
        </ol>
      </Card>

      {review.wins.length > 0 && (
        <Card icon={ThumbsUp} title="做得好的">
          <ul className="divide-y divide-line">
            {review.wins.map((w, i) => (
              <li key={i} className="flex gap-2.5 py-2.5 leading-relaxed first:pt-0 last:pb-0">
                <CircleCheck size={17} className="mt-1 shrink-0 text-accent" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {review.issues.length > 0 && (
        <Card icon={TriangleAlert} title="最值得改的">
          <ul className="divide-y divide-line">
            {review.issues.map((w, i) => (
              <li key={i} className="flex gap-2.5 py-2.5 leading-relaxed first:pt-0 last:pb-0">
                <CircleAlert size={17} className="mt-1 shrink-0 text-warn" />
                {w}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {review.dimensions.map((d) => {
        const v = VERDICT[d.verdict];
        return (
          <Card
            key={d.key}
            icon={ICONS[d.key]}
            title={DIMENSIONS[d.key]}
            aside={
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${v.className}`}>
                <v.icon size={14} />
                {v.label}
              </span>
            }
          >
            <p className="font-medium leading-relaxed">{d.summary}</p>
            {d.evidence && <p className="num mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-muted">{d.evidence}</p>}
          </Card>
        );
      })}
    </>
  );
}
