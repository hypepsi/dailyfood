"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
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
 * 节奏调节：增重 / 保持 / 慢慢减 / 稳稳减 / 快速减。
 * 每一档都按最新身体数据算好了热量目标，选一档、点一下才会采用。
 */
export function GoalRecommendation({ profile, options, basis, bmr }: Props) {
  const router = useRouter();
  const [pace, setPace] = useState<GoalPace>(profile.goalPace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const chosen = options.find((o) => o.pace === pace)!;
  const same = pace === profile.goalPace && chosen.calorieTarget === profile.calorieTarget && chosen.proteinTargetG === profile.proteinTargetG;

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await request("PUT", "/api/profile", { ...profile, goalPace: pace, calorieTarget: chosen.calorieTarget, proteinTargetG: chosen.proteinTargetG });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-accent">我想要的节奏</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">选一个节奏，系统按你最新的身体数据算出每天该吃多少。</p>

      <div className="mt-3 space-y-2">
        {options.map((o) => {
          const selected = o.pace === pace;
          return (
            <button
              key={o.pace}
              type="button"
              onClick={() => setPace(o.pace)}
              aria-pressed={selected}
              className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${selected ? "border-accent bg-tint" : "border-line bg-bg"}`}
            >
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-accent" : "border-faint"}`}>
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`font-bold ${selected ? "text-accent-deep" : ""}`}>{o.label}</span>
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

      <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3">
        <p className="num text-sm">
          每天 <b>{chosen.calorieTarget} kcal</b>，蛋白质 <b>{chosen.proteinTargetG} g</b>
        </p>
        <ul className="num mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted">
          {basis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
      {same ? (
        <p className="mt-3 text-sm font-medium text-accent">当前目标就是按这个节奏算的</p>
      ) : (
        <button className="btn-primary mt-3 w-full" onClick={apply} disabled={busy}>
          <RefreshCw size={17} className={busy ? "animate-spin" : ""} />
          {busy ? "更新中…" : `按「${chosen.label}」更新目标`}
        </button>
      )}
    </section>
  );
}
