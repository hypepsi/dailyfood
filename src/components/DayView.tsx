import Link from "next/link";
import { ChevronLeft, ChevronRight, Egg, Flame, History, Scale, Utensils } from "lucide-react";
import type { User } from "@/db/schema";
import { addDays, daysBetween, formatDateCn, shortDate } from "@/lib/time";
import { kgToJin, rollingAverage } from "@/lib/weight";
import { getDailyTotals, getPendingDrafts } from "@/services/meals";
import { getDailySeries, getLatestBodyFat } from "@/services/metrics";
import { ACTIVITY } from "@/lib/goals";
import { getActivities } from "@/services/activity";
import { getDaySummary, getDeficitSummary, getEnergy, getWeightStats } from "@/services/snapshot";
import { ActivityCard } from "./ActivityCard";
import { AdviceCard } from "./AdviceCard";
import { DeficitCard } from "./DeficitCard";
import { BigStat, Card, ProgressBar, StatRow } from "./Card";
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

  // 今天还在吃，算进去会把平均值拉低；看今天时取之前的 7 天，看过去某天时取截至那天的 7 天
  const week = isToday ? getDailyTotals(user, addDays(date, -7), addDays(date, -1)) : getDailyTotals(user, addDays(date, -6), date);
  const weekAvg = week.length ? Math.round(week.reduce((s, d) => s + d.kcal, 0) / week.length) : null;

  const weight = getWeightStats(user, today);
  const weightSeries = rollingAverage(getDailySeries(user, "weightKg", addDays(today, -29), today));
  const drafts = isToday ? getPendingDrafts(user) : [];
  const deficit = getDeficitSummary(user, date);
  const activity = getActivities(user, date, date).get(date) ?? null;
  const { energy } = getEnergy(user, today);
  const bodyFat = getLatestBodyFat(user);
  // 脂肪量 = 同一次测量的体重 × 体脂率，由程序换算
  const fatMass = bodyFat?.weightKg ? (bodyFat.weightKg * bodyFat.pct) / 100 : null;
  // 优先用 7 日平均；最近 7 天没称重时退回到最后一次的体重
  const referenceKg = weight.avg7Kg ?? weight.latestKg;
  const toGoal = referenceKg !== null && goals.targetWeightKg !== null ? referenceKg - goals.targetWeightKg : null;

  return (
    <div className="space-y-3 lg:space-y-4">
      <header className="flex items-center justify-between">
        <Link
          href={`/day/${addDays(date, -1)}`}
          aria-label="前一天"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-line"
        >
          <ChevronLeft size={24} />
        </Link>
        <div className="text-center">
          <h1 className="page-title">{formatDateCn(date)}</h1>
          {isToday ? (
            <p className="text-[13px] font-medium text-muted">今天</p>
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

      {drafts.map((d) => (
        <Link key={d.id} href={`/meal/${d.id}`} className="flex items-center justify-between rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">
          <span>「{d.title || "一顿饭"}」还没确认，未计入今天</span>
          <ChevronRight size={18} />
        </Link>
      ))}

      <Card icon={Flame} title="热量" action={{ href: "/trends", label: "历史", icon: History }}>
        <BigStat
          label={over ? "已超出今日目标" : isToday ? "今日剩余" : "当日剩余"}
          value={Math.abs(day.kcalRemaining).toLocaleString("en-US")}
          unit="kcal"
          tone={over ? "warn" : "accent"}
        />
        <ProgressBar value={totals.kcal} max={goals.calorieTarget} over={over} />
        <StatRow
          stats={[
            { label: "已摄入", value: `${totals.kcal}` },
            { label: "目标", value: `${goals.calorieTarget}` },
            { label: "近7天日均", value: weekAvg === null ? "—" : `${weekAvg}` },
          ]}
        />
      </Card>

      <Card icon={Egg} title="蛋白质" action={{ href: "/trends", label: "历史", icon: History }}>
        <BigStat label={proteinDone ? "已达标" : "还差"} value={`${Math.round(proteinDone ? totals.proteinG : day.proteinRemaining)}`} unit="g" />
        <ProgressBar value={totals.proteinG} max={goals.proteinTargetG} />
        <StatRow
          stats={[
            { label: "已摄入", value: `${Math.round(totals.proteinG)} g` },
            { label: "目标", value: `${goals.proteinTargetG} g` },
            { label: "碳水 / 脂肪", value: `${Math.round(totals.carbsG)} / ${Math.round(totals.fatG)} g` },
          ]}
        />
      </Card>

      <DeficitCard summary={deficit} isToday={isToday} />

      <ActivityCard
        key={`${date}:${activity?.kcal ?? ""}`}
        date={date}
        isToday={isToday}
        burn={deficit?.day ?? null}
        entry={activity}
        estimateBasis={energy ? `基础代谢 ${energy.bmr} × 活动系数 ${ACTIVITY[user.activityLevel].factor}` : ""}
      />

      {isToday && day.meals.length > 0 && <AdviceCard refreshKey={`${deficit?.day.burn ?? ""}|${day.meals.map((m) => `${m.id}:${m.updatedAt}`).join(",")}`} />}
      <Card icon={Utensils} title={isToday ? "今日饮食" : "当日饮食"}>
        <MealList meals={day.meals} date={date} isToday={isToday} timezone={user.timezone} />
      </Card>

      <Card icon={Scale} title="体重与体脂" action={{ href: "/weight", label: "历史", icon: History }}>
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
            {bodyFat && (
              <StatRow
                stats={[
                  { label: `体脂率${bodyFat.date === weight.latestDate ? "" : `（${shortDate(bodyFat.date)}）`}`, value: `${bodyFat.pct}%` },
                  { label: "脂肪量", value: fatMass === null ? "—" : `${fatMass.toFixed(1)} kg` },
                  { label: "去脂体重", value: fatMass === null ? "—" : `${(bodyFat.weightKg! - fatMass).toFixed(1)} kg` },
                ]}
              />
            )}
          </>
        )}
      </Card>

      <CaptureActions date={date} isToday={isToday} />
    </div>
  );
}
