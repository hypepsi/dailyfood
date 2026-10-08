import { Flag, Flame, Footprints, Medal, Trophy } from "lucide-react";
import { deficitEquivalents, deficitTier, fatGrams, fatInJin, weighsLike, type Tier } from "@/lib/energy";
import type { DeficitSummary } from "@/services/snapshot";
import { BigStat, Card, StatRow } from "./Card";

/** 档位条上从左到右的五档；“吃超了”不在条上，单独用警示色显示 */
const LADDER: { key: Tier["key"]; label: string }[] = [
  { key: "even", label: "持平" },
  { key: "small", label: "小步" },
  { key: "steady", label: "稳稳" },
  { key: "strong", label: "强力" },
  { key: "too_much", label: "偏大" },
];

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}`;

/** “10月下旬”“明年1月上旬”这样的说法：预计日期本来就是估的，不写到具体哪一天 */
function etaText(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const part = d <= 10 ? "上旬" : d <= 20 ? "中旬" : "下旬";
  return `${y > new Date().getFullYear() ? "明年 " : ""}${m} 月${part}`;
}

function fatText(deficit: number): string {
  const g = Math.abs(fatGrams(deficit));
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g} g`;
}

/** 成就卡片：今天的热量差、所在档位，以及累计下来相当于多少脂肪 */
export function DeficitCard({ summary, isToday }: { summary: DeficitSummary | null; isToday: boolean }) {
  if (!summary) {
    return (
      <Card icon={Trophy} title="热量差">
        <p className="py-1 text-muted">上传一次体脂秤报告，或在「我的」里填好性别、出生日期和身高，就能算出每天的热量差。</p>
      </Card>
    );
  }

  const { day, settled, hasRecords, deficitAtTarget, week, allTime, streak, journey, direction } = summary;
  const losing = direction === "loss";
  // 只有这一天吃完了、而且确实有缺口，才换算成米饭和慢跑
  const today = losing && hasRecords && settled && day.deficit >= 100 ? deficitEquivalents(day.deficit, summary.weightKg) : null;
  const tier = deficitTier(day.deficit, direction);
  const surplus = day.deficit < 0;
  const bad = tier.bad;
  const step = LADDER.findIndex((l) => l.key === tier.key);

  const atTarget = !losing ? (
    <>
      吃满{isToday ? "今天的" : ""}目标后，{deficitAtTarget >= 0 ? `比消耗少 ${deficitAtTarget.toLocaleString("en-US")}` : `比消耗多 ${Math.abs(deficitAtTarget).toLocaleString("en-US")}`} kcal
    </>
  ) : deficitAtTarget > 0 ? (
      <>
        吃满{isToday ? "今天的" : ""}目标后，热量差约 <b className="text-ink">{deficitAtTarget.toLocaleString("en-US")} kcal</b>，≈ {fatText(deficitAtTarget)} 脂肪
      </>
    ) : (
      <>按目标吃的话，会比消耗多 {Math.abs(deficitAtTarget).toLocaleString("en-US")} kcal</>
    );

  return (
    <Card icon={Trophy} title="热量差">
      {!hasRecords ? (
        // 没有饮食记录就不知道吃了多少，不能把全部消耗都算成热量差
        <p className="text-muted">
          {isToday ? "今天还没有饮食记录，记了第一顿就开始计算。" : "这一天没有饮食记录，无法计算热量差。"}
          {isToday && <span className="mt-1 block text-[13px]">{atTarget}</span>}
        </p>
      ) : (
        <BigStat
          label={surplus ? (isToday ? (settled ? "今天多吃了" : "目前已经多吃了") : "当天多吃了") : !settled ? "目前的热量差（今天还没吃完）" : isToday ? "今天的热量差" : "当天的热量差"}
          value={Math.abs(day.deficit).toLocaleString("en-US")}
          unit="kcal"
          tone={surplus && losing ? "warn" : "accent"}
          sub={!settled ? (surplus ? null : atTarget) : losing && !surplus ? <span className="font-semibold text-accent">≈ 少了 {fatText(day.deficit)} 脂肪</span> : null}
        />
      )}

      {hasRecords && settled && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${bad ? "bg-warn-tint text-warn" : "bg-tint text-accent-deep"}`}>{tier.label}</span>
            <span className="text-[13px] text-muted">{tier.message}</span>
          </div>
          {losing && !surplus && (
            <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="热量差档位">
              {LADDER.map((l, i) => (
                <li key={l.key} className="text-center">
                  <div className={`h-2 rounded-full ${i > step ? "bg-track" : l.key === "too_much" ? "bg-warn" : "bg-accent"}`} />
                  <div className={`mt-1 text-[11px] ${i === step ? "font-bold text-ink" : "text-faint"}`}>{l.label}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <StatRow
        stats={[
          { label: day.source === "watch" ? "消耗（手表）" : "消耗（估算）", value: `${day.burn}` },
          { label: "已摄入", value: `${day.intake}` },
          { label: `近7天累计`, value: week.days ? signed(week.total) : "—" },
        ]}
      />

      {allTime.days > 0 && (
        <div className="mt-3 space-y-2.5 rounded-2xl bg-bg px-3.5 py-3">
          {/* 今天的缺口，换成吃的和动的 */}
          {today && (
            <p className="flex items-start gap-2 text-sm leading-relaxed">
              <Footprints size={17} className="mt-0.5 shrink-0 text-accent" />
              <span>
                {isToday ? "今天" : "这天"}的缺口相当于少吃 <b>{today.riceBowls} 碗米饭</b>，或者慢跑 <b>{today.jogMinutes} 分钟</b>
              </span>
            </p>
          )}

          {/* 累计下来，换成看得见的重量 */}
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <Medal size={17} className="mt-0.5 shrink-0 text-accent" />
            {!losing ? (
              <span>
                记录 {allTime.days} 天，累计{allTime.total >= 0 ? "少吃" : "多吃"}了 <b>{Math.abs(allTime.total).toLocaleString("en-US")} kcal</b>
              </span>
            ) : allTime.total > 0 ? (
              <span>
                记录 {allTime.days} 天，已经甩掉约 <b className="text-accent-deep">{fatInJin(fatGrams(allTime.total))}肥肉</b>
                {weighsLike(fatGrams(allTime.total)) && <>，有{weighsLike(fatGrams(allTime.total))}那么重</>}
              </span>
            ) : (
              <span>记录 {allTime.days} 天，累计多吃了 {Math.abs(allTime.total).toLocaleString("en-US")} kcal，慢慢调回来就好</span>
            )}
          </p>

          {/* 到目标体重的路走了多远 */}
          {losing && journey && (
            <div>
              <p className="flex items-start gap-2 text-sm leading-relaxed">
                <Flag size={17} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  到目标要减 {journey.totalKg} kg，已经走了 <b className="text-accent-deep">{journey.percent}%</b>
                  {journey.eta && <>，照最近的速度 {etaText(journey.eta)}能到</>}
                </span>
              </p>
              <div className="ml-[25px] mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                <div className="bar-fill h-full rounded-full bg-accent" style={{ width: `${Math.max(journey.percent, 2)}%` }} />
              </div>
            </div>
          )}

          {streak >= 2 && (
            <p className="flex items-center gap-2 text-sm">
              <Flame size={17} className="shrink-0 text-accent" />
              已经连续记录 <b>{streak} 天</b>
            </p>
          )}
          <p className="text-xs text-faint">按记录的热量差推算，实际以体重为准</p>
        </div>
      )}
    </Card>
  );
}
