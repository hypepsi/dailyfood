"use client";

import { useEffect, useState } from "react";
import { Check, HeartPulse } from "lucide-react";
import type { GlucoseLevel, GlucoseReview } from "@/lib/ai/glucose";
import { Card } from "./Card";

const LEVEL: Record<GlucoseLevel, { label: string; text: string; dot: string; pill: string }> = {
  steady: { label: "平稳", text: "text-accent", dot: "bg-accent", pill: "bg-tint text-accent" },
  moderate: { label: "一般", text: "text-caution", dot: "bg-caution", pill: "bg-caution/15 text-caution" },
  spiky: { label: "偏快", text: "text-danger", dot: "bg-danger", pill: "bg-danger/15 text-danger" },
};

type Props = {
  /** 今天：条件满足后去接口取（需要时生成）；过去某天：直接用保存过的 */
  isToday: boolean;
  ready: boolean;
  logged: { breakfast: boolean; lunch: boolean; dinner: boolean };
  stored: GlucoseReview | null;
  refreshKey: string;
};

/** 血糖卡片：三餐记完或晚上 9:30 后，AI 盘点今天吃的对血糖的影响 */
export function GlucoseCard({ isToday, ready, logged, stored, refreshKey }: Props) {
  const [review, setReview] = useState<GlucoseReview | null>(stored);
  const [loading, setLoading] = useState(isToday && ready);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isToday || !ready) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch("/api/glucose")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setReview(d.review ?? null))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isToday, ready, refreshKey]);

  if (!isToday && !review) return null;

  const level = review && !loading ? LEVEL[review.level] : null;
  return (
    <Card icon={HeartPulse} title="血糖" aside={level && <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${level.pill}`}>{level.label}</span>}>
      {!ready ? (
        <>
          <p className="text-sm leading-relaxed text-muted">三餐都记完，或者到晚上 9:30，会自动盘点今天吃的对血糖的影响。</p>
          <div className="mt-3 flex gap-2">
            {(
              [
                ["breakfast", "早餐"],
                ["lunch", "午餐"],
                ["dinner", "晚餐"],
              ] as const
            ).map(([key, label]) => (
              <span
                key={key}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium ${logged[key] ? "bg-tint text-accent" : "bg-track text-muted"}`}
              >
                {logged[key] && <Check size={13} strokeWidth={3} />}
                {label}
              </span>
            ))}
          </div>
        </>
      ) : loading ? (
        <p className="animate-pulse text-sm font-medium">正在盘点今天的饮食…</p>
      ) : failed || !review ? (
        <p className="text-sm text-muted">这次没盘点出来，过一会儿再打开首页试试。</p>
      ) : (
        <>
          <p className="font-medium leading-relaxed">{review.summary}</p>
          {review.meals.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {review.meals.map((m, i) => (
                <li key={i} className="flex items-start gap-3 py-2.5">
                  <span className="w-16 shrink-0 text-sm font-semibold">{m.meal}</span>
                  <span className={`flex w-12 shrink-0 items-center gap-1.5 text-[13px] font-bold ${LEVEL[m.level].text}`}>
                    <span className={`h-2 w-2 rounded-full ${LEVEL[m.level].dot}`} />
                    {LEVEL[m.level].label}
                  </span>
                  <span className="flex-1 text-sm leading-relaxed text-muted">{m.note}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 rounded-2xl bg-tint px-4 py-3">
            <p className="mb-1 text-[13px] font-bold text-accent">明天可以这样吃</p>
            <ul className="space-y-1">
              {review.tips.map((t, i) => (
                <li key={i} className="text-sm leading-relaxed text-accent-deep">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  );
}
