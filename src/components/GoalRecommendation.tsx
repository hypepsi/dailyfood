"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GoalPace } from "@/db/schema";
import { request } from "@/lib/client-api";
import type { ProfileValues } from "./SettingsForm";

export type PaceOption = {
  pace: GoalPace;
  label: string;
  hint: string;
  calorieTarget: number;
  proteinTargetG: number;
  /** 这一档想少吃的量被“不低于基础代谢”拦住了 */
  limited: boolean;
};

type Props = {
  profile: ProfileValues;
  /** 每一档节奏算出来的推荐目标 */
  options: PaceOption[];
  /** 推荐值的计算依据，逐行展示 */
  basis: string[];
  bmr: number;
};

/**
 * 我的方案：每天吃多少由“节奏 + 最新身体数据”算出来，这里只需要选节奏。
 * 增重 / 保持 / 慢慢减 / 稳稳减 / 快速减，点哪一档就立刻生效。
 */
export function GoalRecommendation({ profile, options, basis, bmr }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<GoalPace | null>(null);
  const [error, setError] = useState("");
  const current = options.find((o) => o.pace === profile.goalPace)!;

  /** 选哪一档就立刻按哪一档来：每天该吃多少由系统算好，不用自己填 */
  async function choose(pace: GoalPace) {
    if (pace === profile.goalPace || busy) return;
    setBusy(pace);
    setError("");
    try {
      const { calorieTarget: _c, proteinTargetG: _p, ...fields } = profile;
      await request("PUT", "/api/profile", { ...fields, goalPace: pace });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-accent">我的方案</h2>
      <div className="num mt-2 flex gap-8">
        <div>
          <div className="text-xs text-muted">每天热量</div>
          <div className="text-[2rem] font-extrabold leading-tight tracking-tight text-accent-deep">
            {profile.calorieTarget}
            <span className="ml-1 text-sm font-bold">kcal</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">每天蛋白质</div>
          <div className="text-[2rem] font-extrabold leading-tight tracking-tight text-accent-deep">
            {profile.proteinTargetG}
            <span className="ml-1 text-sm font-bold">g</span>
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">系统按你选的节奏和最新的身体数据算出来的。身体数据更新后会自动跟着变。</p>

      <h3 className="mt-4 text-sm font-semibold">选一个节奏</h3>
      <div className="mt-2 space-y-2">
        {options.map((o) => {
          const selected = o.pace === profile.goalPace;
          return (
            <button
              key={o.pace}
              type="button"
              onClick={() => choose(o.pace)}
              disabled={busy !== null}
              aria-pressed={selected}
              className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60 ${selected ? "border-accent bg-tint" : "border-line bg-bg"}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-accent" : "border-faint"}`}>
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${selected ? "text-accent-deep" : ""}`}>{busy === o.pace ? "切换中…" : o.label}</span>
                  <span className="num shrink-0 text-sm font-semibold">{o.calorieTarget} kcal</span>
                </span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                  {o.limited ? `按这一档算会低于基础代谢 ${bmr}，所以最低只给到 ${o.calorieTarget}` : o.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}

      <ul className="num mt-3 space-y-0.5 rounded-2xl bg-bg px-3.5 py-3 text-xs leading-relaxed text-muted">
        {basis.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {current.limited && <li>当前这一档已按“不低于基础代谢”调整</li>}
      </ul>
    </section>
  );
}
