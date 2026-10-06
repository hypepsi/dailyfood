/** 所有“哪一天”的判断都按用户时区，而不是服务器时区 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isDateString(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function isTimeString(s: string): boolean {
  if (!TIME_RE.test(s)) return false;
  const [h, m] = s.split(":").map(Number);
  return h < 24 && m < 60;
}

export function localParts(ts: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ts));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export const localDate = (ts: number, tz: string) => localParts(ts, tz).date;

function tzOffsetMs(ts: number, tz: string): number {
  const p = localParts(ts, tz);
  const asUtc = Date.parse(`${p.date}T${p.time}:00Z`);
  return asUtc - Math.floor(ts / 60000) * 60000;
}

/** 用户时区下的日期+时间 → UTC 毫秒时间戳 */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const naive = Date.parse(`${date}T${time}:00Z`);
  const first = naive - tzOffsetMs(naive, tz);
  // 夏令时切换附近再校正一次
  return naive - tzOffsetMs(first, tz);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** from..to（含两端）的所有日期 */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function formatDateCn(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${WEEKDAYS[d.getUTCDay()]}`;
}

export function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function ageOn(birthDate: string, onDate: string): number {
  let age = Number(onDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (onDate.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}
