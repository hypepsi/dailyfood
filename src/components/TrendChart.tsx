"use client";

import { useState } from "react";

export type ChartPoint = { date: string; value: number };

type Props = {
  kind: "line" | "bar";
  from: string;
  to: string;
  /** 主序列：折线或柱 */
  primary: { label: string; points: ChartPoint[] };
  /** 次序列：只画浅色圆点（例如每日实测体重） */
  secondary?: { label: string; points: ChartPoint[] };
  /** 目标参考线 */
  target?: { label: string; value: number };
  unit: string;
  digits?: number;
};

const W = 340;
const H = 170;
const PAD = { top: 10, right: 8, bottom: 22, left: 38 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const dayIndex = (from: string, date: string) => Math.round((Date.parse(date) - Date.parse(from)) / 86400000);
const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** 选 3~4 个整齐的刻度 */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-6; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

/** 趋势页通用图表：单一纵轴，悬停/按住显示当日数值 */
export function TrendChart({ kind, from, to, primary, secondary, target, unit, digits = 0 }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const days = Math.max(1, dayIndex(from, to));
  const all = [...primary.points, ...(secondary?.points ?? [])];
  if (all.length === 0) return <p className="py-8 text-center text-sm text-faint">这段时间还没有数据</p>;

  const values = all.map((p) => p.value).concat(target ? [target.value] : []);
  let yMin = kind === "bar" ? 0 : Math.min(...values);
  let yMax = Math.max(...values);
  if (kind === "line") {
    const pad = Math.max((yMax - yMin) * 0.15, yMax * 0.005, 0.2);
    yMin -= pad;
    yMax += pad;
  } else {
    yMax *= 1.08;
  }

  // 柱状图两侧各留半个柱宽
  const inset = kind === "bar" ? PLOT_W / (days + 1) / 2 : 4;
  const x = (date: string) => PAD.left + inset + (dayIndex(from, date) / days) * (PLOT_W - inset * 2);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;
  const barW = Math.max(2, Math.min(16, (PLOT_W / (days + 1)) - 2));
  const ticks = niceTicks(yMin, yMax);
  const fmt = (v: number) => v.toFixed(digits);

  const dates = [...new Set(all.map((p) => p.date))].sort();
  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = dates[0];
    for (const d of dates) if (Math.abs(x(d) - px) < Math.abs(x(best) - px)) best = d;
    setHover(best);
  }

  const hoverPrimary = hover ? primary.points.find((p) => p.date === hover) : undefined;
  const hoverSecondary = hover ? secondary?.points.find((p) => p.date === hover) : undefined;
  const xLabels = days >= 4 ? [from, to] : [from];

  return (
    <div>
      <div className="mb-1 flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {hover ? (
          <span className="num text-ink">
            <span className="mr-2 text-muted">{short(hover)}</span>
            {hoverPrimary && (
              <>
                {secondary ? `${primary.label} ` : ""}
                <b>{fmt(hoverPrimary.value)}</b> {unit}
              </>
            )}
            {hoverSecondary && (
              <span className="ml-3">
                {secondary!.label} <b>{fmt(hoverSecondary.value)}</b> {unit}
              </span>
            )}
          </span>
        ) : (
          <>
            {secondary && (
              <>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-0.5 w-4 rounded bg-accent" />
                  {primary.label}
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block h-2 w-2 rounded-full bg-faint" />
                  {secondary.label}
                </span>
              </>
            )}
            {target && (
              <span className="flex items-center gap-1.5">
                <i className="inline-block w-4 border-t-2 border-dashed border-faint" />
                {target.label} {fmt(target.value)}
              </span>
            )}
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`${primary.label}趋势图`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--faint)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {xLabels.map((d, i) => (
          <text key={d} x={i === 0 ? PAD.left : W - PAD.right} y={H - 5} textAnchor={i === 0 ? "start" : "end"} fontSize="10" fill="var(--faint)">
            {short(d)}
          </text>
        ))}
        {target && (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(target.value)} y2={y(target.value)} stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" />
        )}
        {hover && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--faint)" strokeWidth="1" />}

        {secondary?.points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={p.date === hover ? 3.5 : 2.5} fill="var(--faint)" />
        ))}

        {kind === "bar" &&
          primary.points.map((p) => {
            const h = Math.max(1, y(0) - y(p.value));
            const r = Math.min(4, barW / 2, h);
            const left = x(p.date) - barW / 2;
            const top = y(p.value);
            // 只有顶端是圆角，底部贴着基线
            const d = `M${left},${top + h} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${top + h} Z`;
            return <path key={p.date} d={d} fill="var(--accent)" opacity={hover && hover !== p.date ? 0.45 : 1} />;
          })}

        {kind === "line" && (
          <>
            {primary.points.length > 1 && (
              <polyline
                points={primary.points.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {(primary.points.length === 1 || !secondary) &&
              primary.points.length <= 31 &&
              primary.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3" fill="var(--accent)" stroke="var(--card)" strokeWidth="1.5" />)}
            {hoverPrimary && <circle cx={x(hoverPrimary.date)} cy={y(hoverPrimary.value)} r="4.5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />}
          </>
        )}
      </svg>
    </div>
  );
}
