import { addDays, daysBetween } from "./time";
import { round1 } from "./nutrition";

export type DailyValue = { date: string; value: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 截至 endDate 的最近 `days` 天内有记录日的平均值；没有记录返回 null */
export function windowAverage(series: DailyValue[], endDate: string, days = 7): number | null {
  const start = addDays(endDate, -(days - 1));
  const inWindow = series.filter((p) => p.date >= start && p.date <= endDate);
  if (inWindow.length === 0) return null;
  return round2(inWindow.reduce((s, p) => s + p.value, 0) / inWindow.length);
}

/** 每个有记录的日期对应的 7 日滑动平均，用于画平滑曲线 */
export function rollingAverage(series: DailyValue[], days = 7): DailyValue[] {
  return series.map((p) => ({ date: p.date, value: windowAverage(series, p.date, days)! }));
}

/**
 * 最近 `days` 天的线性回归斜率，换算成 kg/周（负数表示在下降）。
 * 至少需要 4 个点且跨度不少于 7 天，否则单日波动会被误当成趋势。
 */
export function trendPerWeek(series: DailyValue[], endDate: string, days = 30): number | null {
  const start = addDays(endDate, -(days - 1));
  const pts = series
    .filter((p) => p.date >= start && p.date <= endDate)
    .map((p) => ({ x: daysBetween(start, p.date), y: p.value }));
  if (pts.length < 4) return null;
  const span = pts[pts.length - 1].x - pts[0].x;
  if (span < 7) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  return round2((sxy / sxx) * 7);
}

export function kgToJin(kg: number): string {
  return `${round1(kg * 2)} 斤`;
}

export function bmi(weightKg: number, heightCm: number): number {
  return round1(weightKg / (heightCm / 100) ** 2);
}
