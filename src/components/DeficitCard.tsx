import { Trophy } from "lucide-react";
import { deficitTier, fatGrams, type Tier } from "@/lib/energy";
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

  const { day, settled, hasRecords, deficitAtTarget, week, allTime, streak } = summary;
  const tier = deficitTier(day.deficit);
  const surplus = day.deficit < 0;
  const bad = tier.key === "surplus" || tier.key === "too_much";
  const step = LADDER.findIndex((l) => l.key === tier.key);

  const atTarget =
    deficitAtTarget > 0 ? (
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
          tone={surplus ? "warn" : "accent"}
          sub={surplus ? null : settled ? <span className="font-semibold text-accent">≈ 少了 {fatText(day.deficit)} 脂肪</span> : atTarget}
        />
      )}

      {hasRecords && settled && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${bad ? "bg-warn-tint text-warn" : "bg-tint text-accent-deep"}`}>{tier.label}</span>
            <span className="text-[13px] text-muted">{tier.message}</span>
          </div>
          {!surplus && (
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
        <p className="num mt-3 rounded-2xl bg-bg px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">
          {allTime.total > 0 ? (
            <>
              有记录的 {allTime.days} 天里累计热量差 <b className="text-ink">{allTime.total.toLocaleString("en-US")} kcal</b>，相当于{" "}
              <b className="text-accent-deep">{fatText(allTime.total)} 脂肪</b>
            </>
          ) : (
            <>有记录的 {allTime.days} 天里累计多吃了 {Math.abs(allTime.total).toLocaleString("en-US")} kcal，慢慢调回来就好</>
          )}
          {streak >= 2 && <> · 已连续记录 {streak} 天</>}
        </p>
      )}
    </Card>
  );
}
