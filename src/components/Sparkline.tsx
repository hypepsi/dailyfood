import type { DailyValue } from "@/lib/weight";
import { daysBetween } from "@/lib/time";

/** 首页体重卡片里的迷你趋势线，按真实日期间隔排布 */
export function Sparkline({ series }: { series: DailyValue[] }) {
  if (series.length < 2) return null;
  const W = 300;
  const H = 56;
  const PAD = 5;
  const span = Math.max(1, daysBetween(series[0].date, series.at(-1)!.date));
  const min = Math.min(...series.map((p) => p.value));
  const max = Math.max(...series.map((p) => p.value));
  const range = Math.max(max - min, 0.5);
  const pts = series.map((p) => ({
    x: PAD + (daysBetween(series[0].date, p.date) / span) * (W - PAD * 2),
    y: PAD + (1 - (p.value - min) / range) * (H - PAD * 2),
  }));
  const last = pts.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-11 w-full lg:h-14" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill="var(--accent)" />
    </svg>
  );
}
