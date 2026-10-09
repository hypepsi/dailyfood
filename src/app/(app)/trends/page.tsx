import Link from "next/link";
import { Flame, Percent, Ruler, Scale, Trophy, Utensils } from "lucide-react";
import { BigStat, Card, StatRow } from "@/components/Card";
import { TrendChart } from "@/components/TrendChart";
import { requireUser } from "@/lib/session";
import { addDays } from "@/lib/time";
import { rollingAverage, trendPerWeek, type DailyValue } from "@/lib/weight";
import { getDailyTotals, getFirstMealDate, getTopFoods, todayFor } from "@/services/meals";
import { getDailySeries } from "@/services/metrics";
import { goalsForDate } from "@/services/profile";
import { getDeficitSummary } from "@/services/snapshot";
import { fatGrams } from "@/lib/energy";

const RANGES = [
  { key: "30", label: "30天", days: 30 },
  { key: "90", label: "90天", days: 90 },
  { key: "all", label: "全部", days: null },
] as const;

const signed = (n: number, digits = 1) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
function fatText(deficit: number): string {
  const g = Math.abs(fatGrams(deficit));
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g} g`;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await requireUser();
  const today = todayFor(user);
  const query = await searchParams;
  const range = RANGES.find((r) => r.key === query.range) ?? RANGES[0];

  const allWeights = getDailySeries(user, "weightKg");
  const allBodyFat = getDailySeries(user, "bodyFatPct");
  const allWaist = getDailySeries(user, "waistCm");
  const earliest = [allWeights[0]?.date, allBodyFat[0]?.date, allWaist[0]?.date, getFirstMealDate(user)].filter((d): d is string => !!d).sort()[0];
  // “全部”从最早一条数据开始，至少显示 7 天
  const from = range.days ? addDays(today, -(range.days - 1)) : earliest && earliest < addDays(today, -6) ? earliest : addDays(today, -6);
  const inRange = (s: DailyValue[]) => s.filter((p) => p.date >= from && p.date <= today);

  const weights = inRange(allWeights);
  // 滑动平均用区间之前的数据做铺垫，区间开头才不会失真
  const weightAvg = inRange(rollingAverage(allWeights));
  // 称得还不够多时，“7 日平均”没有意义（两个点的平均线只会画出一条让人看不懂的斜线），
  // 这时直接把每次称的体重连起来；称满 5 次以后再画平均线
  const smooth = weights.length >= 5;
  const weightLine = smooth ? weightAvg : weights;
  const weightChange = weightLine.length >= 2 ? weightLine.at(-1)!.value - weightLine[0].value : null;
  const weightTrend = trendPerWeek(allWeights, today, Math.max(14, Math.round((Date.parse(today) - Date.parse(from)) / 86400000) + 1));

  const deficit = getDeficitSummary(user, today);
  const goals = goalsForDate(user, today);
  const intake = getDailyTotals(user, from, today);
  // 图上画出今天，但今天还没吃完时，平均值和达标天数不算今天：算进去会偏低
  // 和热量差用同一个口径：今天记了晚餐或过了 22 点，就算吃完了，可以计入
  const todayDone = deficit?.settled ?? false;
  const complete = intake.filter((d) => d.date < today || todayDone);
  const avgKcal = mean(complete.map((d) => d.kcal));
  // 每天按当天生效的目标来评价（目标会随节奏和身体数据变化）
  const targetOn = new Map(complete.map((d) => [d.date, goalsForDate(user, d.date).calorieTarget]));
  const withinTarget = complete.filter((d) => d.kcal <= targetOn.get(d.date)!).length;
  const avgGap = mean(complete.map((d) => d.kcal - targetOn.get(d.date)!));

  const deficitDays = (deficit?.days ?? []).filter((d) => d.date >= from);
  const deficitTotal = deficitDays.reduce((s, d) => s + d.deficit, 0);

  const top = getTopFoods(user, from, today, 5);
  const topKcal = top.foods.reduce((sum, f) => sum + f.kcal, 0);

  const bodyFat = inRange(allBodyFat);
  const waist = inRange(allWaist);
  /**
   * 数据只集中在最近几天时，从第一条数据开始画（至少画 7 天），
   * 免得一张 30 天的图只有最右边一小角有东西。
   */
  const fit = (points: { date: string }[]) => {
    const first = points[0]?.date;
    const start = first && first > from ? (first < addDays(today, -6) ? first : addDays(today, -6)) : from;
    return { from: start > from ? start : from, to: today };
  };

  return (
    <div>
      <div className="mb-3 lg:mb-4">
        <h1 className="page-title mb-3 flex h-11 items-center justify-center">趋势</h1>

        <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-line/60 p-1">
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
      </div>

      <div className="space-y-3 lg:space-y-4">
        <Card icon={Scale} title="体重">
          {weightAvg.length === 0 ? (
            <Link href="/weight" className="block py-2 text-muted">
              这段时间没有体重记录，去记一次 →
            </Link>
          ) : (
            <>
              <BigStat label={smooth ? "7日平均" : "最新体重"} value={weightLine.at(-1)!.value.toFixed(smooth ? 1 : 2).replace(/0$/, "")} unit="kg" />
              <div className="mt-2">
                {smooth ? (
                  <TrendChart kind="line" {...fit(weights)} unit="kg" digits={1} primary={{ label: "7日平均", points: weightAvg }} secondary={{ label: "当日体重", points: weights }} />
                ) : (
                  <TrendChart kind="line" {...fit(weights)} unit="kg" digits={2} primary={{ label: "体重", points: weights }} />
                )}
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
          {intake.length === 0 ? (
            <p className="py-2 text-muted">这段时间没有饮食记录</p>
          ) : (
            <>
              <BigStat label="平均每日摄入" value={avgKcal === null ? "—" : `${Math.round(avgKcal)}`} unit="kcal" />
              <div className="mt-2">
                <TrendChart
                  kind="bar"
                  {...fit(intake)}
                  unit="kcal"
                  primary={{ label: "热量", points: intake.map((d) => ({ date: d.date, value: d.kcal })) }}
                  target={{ label: "目标", value: goals.calorieTarget }}
                />
              </div>
              <StatRow
                stats={[
                  { label: "记录天数", value: `${complete.length}` },
                  { label: "未超目标", value: `${withinTarget} 天` },
                  { label: "日均差值", value: avgGap === null ? "—" : signed(Math.round(avgGap), 0) },
                ]}
              />
              <p className="mt-3 text-xs text-faint">平均值只统计有记录的日子；今天吃完后才计入</p>
            </>
          )}
        </Card>

        <Card icon={Trophy} title="热量差">
          {deficitDays.length === 0 ? (
            <p className="py-2 text-muted">{deficit ? "这段时间还没有吃完并记录的日子" : "上传一次体脂秤报告并填好个人资料后，这里会显示每天的热量差"}</p>
          ) : (
            <>
              <BigStat
                label={deficitTotal >= 0 ? "这段时间累计热量差" : "这段时间累计多吃了"}
                value={Math.abs(deficitTotal).toLocaleString("en-US")}
                unit="kcal"
                tone={deficitTotal >= 0 ? "accent" : "warn"}
                sub={deficitTotal > 0 ? <span className="font-semibold text-accent">≈ 少了 {fatText(deficitTotal)} 脂肪</span> : null}
              />
              <div className="mt-2">
                <TrendChart
                  kind="bar"
                  {...fit(deficitDays)}
                  unit="kcal"
                  primary={{ label: "热量差", points: deficitDays.map((d) => ({ date: d.date, value: d.deficit })) }}
                  diverging={{ positive: "有缺口", negative: "吃超了" }}
                />
              </div>
              <StatRow
                stats={[
                  { label: "日均热量差", value: signed(Math.round(deficitTotal / deficitDays.length), 0) },
                  { label: "有缺口", value: `${deficitDays.filter((d) => d.deficit > 0).length} 天` },
                  { label: "吃超了", value: `${deficitDays.filter((d) => d.deficit < 0).length} 天` },
                ]}
              />
              <p className="mt-3 text-xs text-faint">只统计有饮食记录的日子；今天吃完后才计入</p>
            </>
          )}
        </Card>

        {top.foods.length > 0 && (
          <Card icon={Utensils} title="热量主要吃在哪">
            <p className="mb-3 text-[13px] text-muted">这段时间你吃进去热量最多的几样，按自己实际吃的那一份算。</p>
            <ol className="space-y-2.5">
              {top.foods.map((f, i) => (
                <li key={f.name}>
                  <div className="flex items-baseline gap-2">
                    <span className="num w-5 shrink-0 text-right text-[13px] font-bold text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                    <span className="num shrink-0 text-[13px] text-muted">{f.times} 次</span>
                    <span className="num w-[4.5rem] shrink-0 text-right font-bold">{f.kcal.toLocaleString("en-US")}</span>
                  </div>
                  <div className="ml-7 mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                    <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round((f.kcal / top.foods[0].kcal) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="num mt-3 border-t border-line pt-3 text-[13px] text-muted">
              这 {top.foods.length} 样一共 {topKcal.toLocaleString("en-US")} kcal，占全部的 {Math.round((topKcal / top.totalKcal) * 100)}%
            </p>
          </Card>
        )}

        {bodyFat.length > 0 && (
          <Card icon={Percent} title="体脂率">
            <BigStat label="最新" value={bodyFat.at(-1)!.value.toFixed(1)} unit="%" />
            {bodyFat.length > 1 && (
              <div className="mt-2">
                <TrendChart kind="line" {...fit(bodyFat)} unit="%" digits={1} primary={{ label: "体脂率", points: bodyFat }} />
              </div>
            )}
          </Card>
        )}

        {waist.length > 0 && (
          <Card icon={Ruler} title="腰围">
            <BigStat label="最新" value={waist.at(-1)!.value.toFixed(1)} unit="cm" />
            {waist.length > 1 && (
              <div className="mt-2">
                <TrendChart kind="line" {...fit(waist)} unit="cm" digits={1} primary={{ label: "腰围", points: waist }} />
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
