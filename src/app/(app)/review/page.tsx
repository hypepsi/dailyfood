import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ReviewRunner } from "@/components/ReviewRunner";
import { ReviewView } from "@/components/ReviewView";
import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/time";
import { REVIEW_DAYS, getCurrentReview, getReviewWindow, listPastReviews } from "@/services/review";

const monthDay = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

export default async function ReviewPage() {
  const user = await requireUser();
  const window = getReviewWindow(user);
  const current = getCurrentReview(user, window);
  const past = listPastReviews(user, window.end);
  const missing = window.days.filter((d) => !d.logged);

  return (
    <>
      <PageHeader title="7 日 AI 综合分析" />
      <div className="space-y-3 lg:space-y-4">
        <section className="card">
          <p className="leading-relaxed text-muted">
            分析最近 {REVIEW_DAYS} 个完整的自然日（{monthDay(window.start)} – {monthDay(window.end)}，不含今天）。热量、平均值、体重趋势都由程序算好，AI 只负责分析。
          </p>

          <div className="mt-4 flex items-end justify-between">
            <div className="num text-[2.6rem] font-extrabold leading-none tracking-tight text-accent-deep">
              {window.loggedDays}
              <span className="ml-2 text-2xl font-bold text-faint">/ {REVIEW_DAYS} 天</span>
            </div>
            <span className="pb-1 text-muted">已记录</span>
          </div>

          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={window.loggedDays} aria-valuemin={0} aria-valuemax={REVIEW_DAYS}>
            <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${(window.loggedDays / REVIEW_DAYS) * 100}%` }} />
          </div>

          {window.ready ? (
            <div className="mt-4">
              {current && !current.stale ? (
                <p className="font-medium text-accent">{REVIEW_DAYS} 天都有记录，分析结果在下面。数据有修改后可以重新生成。</p>
              ) : (
                <ReviewRunner label={current ? "数据有变化，重新分析" : "生成分析"} />
              )}
            </div>
          ) : (
            <div className="mt-3 text-warn">
              <p>
                已记录 {window.loggedDays} / {REVIEW_DAYS} 天，还需 {missing.length} 天才能生成分析（需要 {REVIEW_DAYS} 天都有记录）
              </p>
              {/* 只差几天时列出是哪几天，点一下就能去补记 */}
              {missing.length <= 3 && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  缺少：
                  {missing.map((d) => (
                    <Link key={d.date} href={`/day/${d.date}`} className="num rounded-full border border-warn px-3 py-1 font-semibold transition active:scale-95">
                      {shortDate(d.date)} 去补记
                    </Link>
                  ))}
                </p>
              )}
            </div>
          )}
        </section>

        {current && !window.ready && (
          <p className="rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">下面这份分析是之前生成的；之后有一天的记录被删掉了，补齐后可以重新生成。</p>
        )}
        {current && <ReviewView review={current.review} />}

        {past.length > 0 && (
          <section className="card">
            <h2 className="mb-1 text-[17px] font-bold">以前的分析</h2>
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
    </>
  );
}
