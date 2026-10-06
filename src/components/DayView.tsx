import Link from "next/link";
import { ChevronLeft, ChevronRight, Egg, Flame, History, Scale, Utensils } from "lucide-react";
import type { User } from "@/db/schema";
import { addDays, daysBetween, formatDateCn } from "@/lib/time";
import { kgToJin, rollingAverage } from "@/lib/weight";
import { getDailyTotals, getPendingDrafts } from "@/services/meals";
import { getDailySeries } from "@/services/metrics";
import { getDaySummary, getWeightStats } from "@/services/snapshot";
import { AdviceCard } from "./AdviceCard";
import { BigStat, Card, MiniCard, StatRow } from "./Card";
import { CaptureActions } from "./CaptureActions";
import { MealList } from "./MealList";
import { Sparkline } from "./Sparkline";

const signed = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

function agoLabel(days: number): string {
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return `${days} 天前`;
}

/** 某一天的完整视图；today 就是首页 */
export function DayView({ user, date, today }: { user: User; date: string; today: string }) {
  const isToday = date === today;
  const day = getDaySummary(user, date);
  const { totals, goals } = day;
  const over = day.kcalRemaining < 0;
  const proteinDone = day.proteinRemaining <= 0;

  const week = getDailyTotals(user, addDays(date, -6), date);
  const weekAvg = week.length ? Math.round(week.reduce((s, d) => s + d.kcal, 0) / week.length) : null;

  const weight = getWeightStats(user, today);
  const weightSeries = rollingAverage(getDailySeries(user, "weightKg", addDays(today, -29), today));
  const drafts = isToday ? getPendingDrafts(user) : [];
  const toGoal = weight.avg7Kg !== null && goals.targetWeightKg !== null ? weight.avg7Kg - goals.targetWeightKg : null;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-5">
      <div className="space-y-3 lg:space-y-5">
        <header className="flex items-center justify-between lg:pb-1">
          <Link
            href={`/day/${addDays(date, -1)}`}
            aria-label="前一天"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-line"
          >
            <ChevronLeft size={24} />
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-bold lg:text-2xl">{formatDateCn(date)}</h1>
            {isToday ? (
              <p className="text-[13px] text-faint">今天</p>
            ) : (
              <Link href="/" className="block text-[13px] text-accent">
                回到今天
              </Link>
            )}
          </div>
          {isToday ? (
            <span className="h-11 w-11" />
          ) : (
            <Link
              href={addDays(date, 1) === today ? "/" : `/day/${addDays(date, 1)}`}
              aria-label="后一天"
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-line"
            >
              <ChevronRight size={24} />
            </Link>
          )}
        </header>

        <CaptureActions date={date} isToday={isToday} />

        {drafts.map((d) => (
          <Link key={d.id} href={`/meal/${d.id}`} className="flex items-center justify-between rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">
            <span>「{d.title || "一顿饭"}」还没确认，未计入今天</span>
            <ChevronRight size={18} />
          </Link>
        ))}

        <div className="grid grid-cols-2 gap-3 lg:gap-5">
          <MiniCard
            icon={Flame}
            title="热量"
            href="/trends"
            label={over ? "已超出" : "还能吃"}
            value={Math.abs(day.kcalRemaining).toLocaleString("en-US")}
            unit="kcal"
            tone={over ? "warn" : "accent"}
            progress={{ value: totals.kcal, max: goals.calorieTarget }}
            footer={`已吃 ${totals.kcal} / ${goals.calorieTarget}`}
          />
          <MiniCard
            icon={Egg}
            title="蛋白质"
            href="/trends"
            label={proteinDone ? "已达标" : "还差"}
            value={`${Math.round(proteinDone ? totals.proteinG : day.proteinRemaining)}`}
            unit="g"
            progress={{ value: totals.proteinG, max: goals.proteinTargetG }}
            footer={`已吃 ${Math.round(totals.proteinG)} / ${goals.proteinTargetG} g`}
          />
        </div>

        {isToday && day.meals.length > 0 && <AdviceCard refreshKey={day.meals.map((m) => `${m.id}:${m.updatedAt}`).join(",")} />}
      </div>

      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Card icon={Utensils} title={isToday ? "今日饮食" : "当日饮食"}>
          <MealList meals={day.meals} date={date} timezone={user.timezone} />
          <p className="num mt-3 border-t border-line pt-3 text-[13px] text-muted">
            碳水 {Math.round(totals.carbsG)} g · 脂肪 {Math.round(totals.fatG)} g
            {weekAvg !== null && <span className="float-right text-faint">近7天日均 {weekAvg} kcal</span>}
          </p>
        </Card>
      </div>

      <div className="lg:col-start-1">
        <Card icon={Scale} title="体重" action={{ href: "/weight", label: "历史", icon: History }}>
          {weight.latestKg === null ? (
            <Link href="/weight" className="block py-1 text-muted">
              还没有体重记录，上传一张体脂秤报告 →
            </Link>
          ) : (
            <>
              <BigStat
                label="最新体重"
                value={weight.latestKg.toFixed(2).replace(/0$/, "")}
                unit="kg"
                sub={
                  <>
                    <span className="text-accent">≈ {kgToJin(weight.latestKg)}</span>
                    <span className="ml-2 text-faint">{agoLabel(daysBetween(weight.latestDate!, today))}</span>
                  </>
                }
              />
              <Sparkline series={weightSeries} />
              <StatRow
                stats={[
                  { label: "7日平均", value: weight.avg7Kg === null ? "—" : `${weight.avg7Kg.toFixed(1)} kg` },
                  {
                    label: "30天趋势",
                    value: weight.trend30PerWeek === null ? "数据不足" : `${signed(weight.trend30PerWeek)} kg/周`,
                  },
                  { label: "距目标", value: toGoal === null ? "—" : toGoal <= 0 ? "已达成" : `${toGoal.toFixed(1)} kg` },
                ]}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
