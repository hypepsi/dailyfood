"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Watch } from "lucide-react";
import { parseNumber, request } from "@/lib/client-api";
import type { ActivityEntry, DayBurn } from "@/lib/energy";
import { BigStat, Card } from "./Card";

type Props = {
  date: string;
  isToday: boolean;
  burn: DayBurn | null;
  entry: ActivityEntry | null;
  /** 没有手表数据时的估算说明，如“基础代谢 1789 × 活动系数 1.375” */
  estimateBasis: string;
};

/** 运动消耗：把手表上的数字抄过来，当天的消耗 = 基础代谢 + 它；没填则按活动水平估算 */
export function ActivityCard({ date, isToday, burn, entry, estimateBasis }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(entry ? String(entry.kcal) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parsed = parseNumber(value);
  const changed = parsed !== null && parsed !== entry?.kcal;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed === null || parsed < 0) return setError("请填手表上显示的千卡数");
    void run(() => request("PUT", "/api/activity", { date, kcal: Math.round(parsed) }));
  };

  const clear = () =>
    void run(async () => {
      await request("DELETE", `/api/activity?date=${date}`);
      setValue("");
    });

  return (
    <Card icon={Watch} title="运动消耗">
      {burn && (
        <BigStat
          label={isToday ? "今天消耗" : "当天消耗"}
          value={burn.burn.toLocaleString("en-US")}
          unit="kcal"
          sub={burn.source === "watch" ? `基础代谢 ${burn.bmr} + 手表运动消耗 ${burn.active}` : `按活动水平估算：${estimateBasis}`}
        />
      )}

      <form onSubmit={save} className="mt-3 border-t border-line pt-3">
        <div className="flex gap-2">
          <input
            className="field num min-w-0 flex-1"
            inputMode="numeric"
            placeholder="手表上的运动消耗，如 1086"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="手表显示的运动消耗千卡数"
          />
          <button className="btn-primary shrink-0 px-5" disabled={busy || !changed}>
            {busy ? "…" : entry ? "更新" : "记录"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-warn">{error}</p>}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          填手表显示的运动消耗，系统会自动加上基础代谢。一天里可以随时更新，以最后一次为准。
          {entry && (
            <button type="button" className="ml-1 underline" onClick={clear} disabled={busy}>
              清除，改回估算
            </button>
          )}
        </p>
      </form>
    </Card>
  );
}
