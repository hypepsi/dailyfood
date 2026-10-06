import Link from "next/link";
import { CalendarCheck, History } from "lucide-react";
import { BigStat, Card, ProgressBar, StatRow } from "@/components/Card";
import { ReviewRunner } from "@/components/ReviewRunner";
import { ReviewView } from "@/components/ReviewView";
import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/time";
import { REVIEW_DAYS, getCurrentReview, getReviewWindow, listPastReviews } from "@/services/review";

export default async function ReviewPage() {
  const user = await requireUser();
  const window = getReviewWindow(user);
  const current = getCurrentReview(user, window);
  const past = listPastReviews(user, window.end);
  const missing = window.days.filter((d) => !d.logged);

  return (
    <div className="space-y-3 lg:space-y-4">
      <h1 className="page-title flex h-11 items-center justify-center">7 日 AI 综合分析</h1>

      <Card icon={CalendarCheck} title="记录进度">
        <BigStat label="已记录" value={`${window.loggedDays}`} unit={`/ ${REVIEW_DAYS} 天`} tone={window.ready ? "accent" : "warn"} />
        <ProgressBar value={window.loggedDays} max={REVIEW_DAYS} over={!window.ready} />
        <StatRow
          stats={[
            { label: "分析区间", value: `${shortDate(window.start)} – ${shortDate(window.end)}` },
            { label: "还需", value: window.ready ? "已记满" : `${missing.length} 天` },
            { label: "今天", value: "不计入" },
          ]}
        />

        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          分析最近 {REVIEW_DAYS} 个完整的自然日，{REVIEW_DAYS} 天都有饮食记录才能生成。热量、平均值、体重趋势都由程序算好，AI 只负责分析。
        </p>

        {/* 只差几天时列出是哪几天，点一下就能去补记 */}
        {!window.ready && missing.length <= 3 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-warn">
            缺少：
            {missing.map((d) => (
              <Link key={d.date} href={`/day/${d.date}`} className="num rounded-full border border-warn px-3 py-1 font-semibold transition active:scale-95">
                {shortDate(d.date)} 去补记
              </Link>
            ))}
          </p>
        )}

        {window.ready && (!current || current.stale) && (
          <div className="mt-4">
            <ReviewRunner label={current ? "数据有变化，重新分析" : "生成分析"} />
          </div>
        )}
      </Card>

      {current && !window.ready && (
        <p className="rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">下面这份分析是之前生成的；之后有一天的记录被删掉了，补齐后可以重新生成。</p>
      )}
      {current && <ReviewView review={current.review} />}

      {past.length > 0 && (
        <Card icon={History} title="以前的分析">
          <div className="divide-y divide-line">
            {past.map((r) => (
              <details key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                <summary className="cursor-pointer list-none">
                  <span className="num text-[13px] text-faint">
                    {shortDate(r.startDate)} – {shortDate(r.endDate)}
                  </span>
                  <span className="mt-0.5 block font-medium leading-relaxed">{r.review.headline}</span>
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
                  {r.review.nextWeek.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
