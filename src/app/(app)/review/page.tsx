import Link from "next/link";
import { CalendarCheck, Check, X } from "lucide-react";
import { ReviewRunner } from "@/components/ReviewRunner";
import { ReviewView } from "@/components/ReviewView";
import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/time";
import { todayFor } from "@/services/meals";
import { REVIEW_DAYS, getCurrentReview, getReviewWindow, listPastReviews } from "@/services/review";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

export default async function ReviewPage() {
  const user = await requireUser();
  const today = todayFor(user);
  const window = getReviewWindow(user);
  const current = getCurrentReview(user, window);
  const past = listPastReviews(user, window.end);

  return (
    <div className="space-y-3 lg:space-y-4">
      <h1 className="text-center text-xl font-bold lg:text-2xl">7 天复盘</h1>

      <section className="card">
        <header className="mb-3 flex items-center gap-2.5">
          <span className="icon-tile">
            <CalendarCheck size={18} strokeWidth={2.5} />
          </span>
          <div>
            <h2 className="text-[17px] font-bold">
              {shortDate(window.start)} – {shortDate(window.end)}
            </h2>
            <p className="text-xs text-muted">
              {window.ready ? "7 天都有记录，可以复盘" : `已记录 ${window.loggedDays} / ${REVIEW_DAYS} 天，记满才能复盘`}
            </p>
          </div>
        </header>

        <ol className="grid grid-cols-7 gap-1.5">
          {window.days.map((d) => (
            <li key={d.date}>
              <Link
                href={d.date === today ? "/" : `/day/${d.date}`}
                aria-label={`${shortDate(d.date)}${d.logged ? "已记录" : "没有记录，点击补记"}`}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs transition-colors ${
                  d.logged ? "border-transparent bg-tint text-accent-deep" : "border-dashed border-warn bg-warn-tint text-warn"
                }`}
              >
                <span className="font-medium">周{weekday(d.date)}</span>
                {d.logged ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
                <span className="num opacity-75">{shortDate(d.date)}</span>
              </Link>
            </li>
          ))}
        </ol>

        {!window.ready && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            复盘要用连续 7 天的完整数据，缺一天结论就不可靠。点上面标红的日子可以补记；今天要等吃完（记了晚餐或过了 22 点）才算进来。
          </p>
        )}

        {window.ready && (
          <div className="mt-4">
            {current && !current.stale ? (
              <p className="text-center text-[13px] text-muted">下面是这 7 天的复盘。数据有修改后可以重新生成。</p>
            ) : (
              <ReviewRunner label={current ? "数据有变化，重新复盘" : "开始复盘"} />
            )}
          </div>
        )}
      </section>

      {current && !window.ready && (
        <p className="rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">下面这份复盘是之前生成的；之后有一天的记录被删掉了，补齐后可以重新复盘。</p>
      )}
      {current && <ReviewView review={current.review} />}

      {past.length > 0 && (
        <section className="card">
          <h2 className="mb-1 text-[17px] font-bold">以前的复盘</h2>
          <div className="divide-y divide-line">
            {past.map((r) => (
              <details key={r.id} className="group py-3 last:pb-0">
                <summary className="cursor-pointer list-none">
                  <span className="num text-[13px] text-muted">
                    {shortDate(r.startDate)} – {shortDate(r.endDate)}
                  </span>
                  <span className="mt-0.5 block font-medium leading-relaxed">{r.review.headline}</span>
                </summary>
                <div className="mt-3 space-y-2 text-sm leading-relaxed">
                  <p className="font-bold">当时定的三件事</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted">
                    {r.review.nextWeek.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ol>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
