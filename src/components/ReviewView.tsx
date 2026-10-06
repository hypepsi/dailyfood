import { CircleAlert, CircleCheck, CircleMinus, ListChecks, ThumbsUp, TriangleAlert } from "lucide-react";
import { DIMENSIONS, type Review, type Verdict } from "@/lib/ai/review";

const VERDICT: Record<Verdict, { label: string; className: string; icon: typeof CircleCheck }> = {
  good: { label: "做得好", className: "bg-tint text-accent-deep", icon: CircleCheck },
  ok: { label: "还行", className: "bg-bg text-muted", icon: CircleMinus },
  attention: { label: "需注意", className: "bg-warn-tint text-warn", icon: CircleAlert },
};

function Section({ icon: Icon, title, children }: { icon: typeof CircleCheck; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="icon-tile">
          <Icon size={18} strokeWidth={2.5} />
        </span>
        <h2 className="text-[17px] font-bold">{title}</h2>
      </header>
      {children}
    </section>
  );
}

/** 一份复盘的完整展示：一句话总结 → 下周三件事 → 做得好 / 要注意 → 八个维度 */
export function ReviewView({ review }: { review: Review }) {
  return (
    <>
      <section className="card-tint">
        <p className="text-lg font-bold leading-relaxed">{review.headline}</p>
      </section>

      <Section icon={ListChecks} title="下周做这三件事">
        <ol className="space-y-2.5">
          {review.nextWeek.map((action, i) => (
            <li key={i} className="flex gap-3">
              <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
              <span className="leading-relaxed">{action}</span>
            </li>
          ))}
        </ol>
      </Section>

      {review.wins.length > 0 && (
        <Section icon={ThumbsUp} title="做得好的">
          <ul className="space-y-2">
            {review.wins.map((w, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <CircleCheck size={18} className="mt-1 shrink-0 text-accent" />
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.issues.length > 0 && (
        <Section icon={TriangleAlert} title="最值得改的">
          <ul className="space-y-2">
            {review.issues.map((w, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <CircleAlert size={18} className="mt-1 shrink-0 text-warn" />
                {w}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {review.dimensions.map((d) => {
        const v = VERDICT[d.verdict];
        return (
          <section key={d.key} className="card">
            <header className="flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold">{DIMENSIONS[d.key]}</h2>
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${v.className}`}>
                <v.icon size={14} />
                {v.label}
              </span>
            </header>
            <p className="mt-2 leading-relaxed">{d.summary}</p>
            {d.evidence && <p className="num mt-2 rounded-xl bg-bg px-3 py-2 text-[13px] leading-relaxed text-muted">{d.evidence}</p>}
          </section>
        );
      })}
    </>
  );
}
