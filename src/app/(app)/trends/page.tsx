import Link from "next/link";
import { Egg, Flame, Percent, Ruler, Scale } from "lucide-react";
import { BigStat, Card, StatRow } from "@/components/Card";
import { TrendChart } from "@/components/TrendChart";
import { requireUser } from "@/lib/session";
import { addDays } from "@/lib/time";
import { rollingAverage, trendPerWeek, type DailyValue } from "@/lib/weight";
import { getDailyTotals, getFirstMealDate, todayFor } from "@/services/meals";
import { getDailySeries } from "@/services/metrics";
import { goalsForDate } from "@/services/profile";

const RANGES = [
  { key: "7", label: "7天", days: 7 },
  { key: "30", label: "30天", days: 30 },
  { key: "90", label: "90天", days: 90 },
  { key: "all", label: "全部", days: null },
] as const;

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const today = todayFor(user);
  const query = await searchParams;
  const range = RANGES.find((r) => r.key === query.range) ?? RANGES[1];

  const allWeights = getDailySeries(user, "weightKg");
  const allBodyFat = getDailySeries(user, "bodyFatPct");
  const allWaist = getDailySeries(user, "waistCm");
  const earliest = [allWeights[0]?.date, allBodyFat[0]?.date, allWaist[0]?.date, getFirstMealDate(user)]
    .filter((d): d is string => !!d)
    .sort()[0];
  // “全部”从最早一条数据开始，至少显示 7 天
  const from = range.days ? addDays(today, -(range.days - 1)) : earliest && earliest < addDays(today, -6) ? earliest : addDays(today, -6);
  const inRange = (s: DailyValue[]) => s.filter((p) => p.date >= from && p.date <= today);

  const weights = inRange(allWeights);
  // 滑动平均用区间之前的数据做铺垫，区间开头才不会失真
  const weightAvg = inRange(rollingAverage(allWeights));
  const weightChange = weightAvg.length >= 2 ? weightAvg.at(-1)!.value - weightAvg[0].value : null;
  const weightTrend = trendPerWeek(allWeights, today, Math.max(14, Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1));

  const goals = goalsForDate(user, today);
  const intake = getDailyTotals(user, from, today);
  const avgKcal = mean(intake.map((d) => d.kcal));
  const avgProtein = mean(intake.map((d) => d.proteinG));
  const withinTarget = intake.filter((d) => d.kcal <= goals.calorieTarget).length;
  const proteinHit = intake.filter((d) => d.proteinG >= goals.proteinTargetG).length;

  const bodyFat = inRange(allBodyFat);
  const waist = inRange(allWaist);
  const chartRange = { from, to: today };

  return (
    <div className="space-y-4">
      <h1 className="pb-1 text-center text-2xl font-bold">趋势</h1>

      <nav className="grid grid-cols-4 gap-1 rounded-2xl bg-line/60 p-1">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/trends?range=${r.key}`}
            replace
            className={`rounded-xl py-2.5 text-center text-sm ${r.key === range.key ? "bg-card font-semibold text-accent shadow-card" : "text-muted"}`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <Card icon={Scale} title="体重">
        {weightAvg.length === 0 ? (
          <Link href="/weight" className="block py-2 text-muted">
            这段时间没有体重记录，去记一次 →
          </Link>
        ) : (
          <>
            <BigStat label="7日平均" value={weightAvg.at(-1)!.value.toFixed(1)} unit="kg" />
            <div className="mt-4">
              <TrendChart kind="line" {...chartRange} unit="kg" digits={1} primary={{ label: "7日平均", points: weightAvg }} secondary={{ label: "当日体重", points: weights }} />
            </div>
            <StatRow
              stats={[
                { label: "区间变化", value: weightChange === null ? "—" : `${signed(weightChange)} kg` },
                { label: "平均每周", value: weightTrend === null ? "数据不足" : `${signed(weightTrend, 2)} kg` },
                { label: "记录天数", value: `${weights.length}` },
              ]}
            />
          </>
        )}
      </Card>

      <Card icon={Flame} title="热量">
        {avgKcal === null ? (
          <p className="py-2 text-muted">这段时间没有饮食记录</p>
        ) : (
          <>
            <BigStat label="平均每日摄入" value={`${Math.round(avgKcal)}`} unit="kcal" />
            <div className="mt-4">
              <TrendChart kind="bar" {...chartRange} unit="kcal" primary={{ label: "热量", points: intake.map((d) => ({ date: d.date, value: d.kcal })) }} target={{ label: "目标", value: goals.calorieTarget }} />
            </div>
            <StatRow
              stats={[
                { label: "记录天数", value: `${intake.length}` },
                { label: "未超目标", value: `${withinTarget} 天` },
                { label: "日均差值", value: `${signed(Math.round(avgKcal) - goals.calorieTarget, 0)}` },
              ]}
            />
            <p className="mt-3 text-xs text-faint">平均值只统计有记录的日子</p>
          </>
        )}
      </Card>

      {avgProtein !== null && (
        <Card icon={Egg} title="蛋白质">
          <BigStat label="平均每日摄入" value={`${Math.round(avgProtein)}`} unit="g" />
          <div className="mt-4">
            <TrendChart kind="bar" {...chartRange} unit="g" primary={{ label: "蛋白质", points: intake.map((d) => ({ date: d.date, value: Math.round(d.proteinG) })) }} target={{ label: "目标", value: goals.proteinTargetG }} />
          </div>
          <StatRow
            stats={[
              { label: "达标天数", value: `${proteinHit} / ${intake.length}` },
              { label: "目标", value: `${goals.proteinTargetG} g` },
            ]}
          />
        </Card>
      )}

      {bodyFat.length > 0 && (
        <Card icon={Percent} title="体脂率">
          <BigStat label="最新" value={bodyFat.at(-1)!.value.toFixed(1)} unit="%" />
          {bodyFat.length > 1 && (
            <div className="mt-4">
              <TrendChart kind="line" {...chartRange} unit="%" digits={1} primary={{ label: "体脂率", points: bodyFat }} />
            </div>
          )}
        </Card>
      )}

      {waist.length > 0 && (
        <Card icon={Ruler} title="腰围">
          <BigStat label="最新" value={waist.at(-1)!.value.toFixed(1)} unit="cm" />
          {waist.length > 1 && (
            <div className="mt-4">
              <TrendChart kind="line" {...chartRange} unit="cm" digits={1} primary={{ label: "腰围", points: waist }} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
