"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { request } from "@/lib/client-api";
import type { ProfileValues } from "./SettingsForm";

type Props = {
  profile: ProfileValues;
  recommended: { calorieTarget: number; proteinTargetG: number };
  /** 推荐值的计算依据，逐行展示 */
  basis: string[];
};

/** 根据最新身体数据算出的推荐目标；点一下才会采用 */
export function GoalRecommendation({ profile, recommended, basis }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const same = recommended.calorieTarget === profile.calorieTarget && recommended.proteinTargetG === profile.proteinTargetG;

  async function apply() {
    setBusy(true);
    setError("");
    try {
      await request("PUT", "/api/profile", { ...profile, ...recommended });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-tint">
      <h2 className="text-sm font-semibold">按最新身体数据推荐</h2>
      <div className="num mt-2 flex gap-8">
        <div>
          <div className="text-xs opacity-75">每日热量</div>
          <div className="text-2xl font-bold">
            {recommended.calorieTarget}
            <span className="ml-1 text-sm font-semibold">kcal</span>
          </div>
        </div>
        <div>
          <div className="text-xs opacity-75">每日蛋白质</div>
          <div className="text-2xl font-bold">
            {recommended.proteinTargetG}
            <span className="ml-1 text-sm font-semibold">g</span>
          </div>
        </div>
      </div>
      <ul className="num mt-3 space-y-0.5 text-[13px] leading-relaxed opacity-85">
        {basis.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
      {same ? (
        <p className="mt-3 text-sm font-medium">当前目标已经和推荐值一致</p>
      ) : (
        <button className="btn-primary mt-3 w-full" onClick={apply} disabled={busy}>
          <RefreshCw size={17} className={busy ? "animate-spin" : ""} />
          {busy ? "更新中…" : "一键更新目标"}
        </button>
      )}
    </section>
  );
}
