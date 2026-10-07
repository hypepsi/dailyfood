"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ESTIMATE_STYLES, type ActivityLevel, type EstimateStyle } from "@/db/schema";
import { ESTIMATE_STYLE } from "@/lib/ai/prompts";
import { parseNumber, request } from "@/lib/client-api";
import { ACTIVITY } from "@/lib/goals";

export type ProfileValues = {
  displayName: string;
  sex: "male" | "female" | null;
  birthDate: string | null;
  heightCm: number | null;
  timezone: string;
  activityLevel: ActivityLevel;
  estimateStyle: EstimateStyle;
  calorieTarget: number;
  proteinTargetG: number;
  targetWeightKg: number | null;
};

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 py-3">
      <span className="flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass = "num w-32 rounded-xl bg-bg px-3 py-2 text-right outline-none focus:ring-1 focus:ring-accent";

export function SettingsForm({ initial, bmrHint }: { initial: ProfileValues; bmrHint: string | null }) {
  const router = useRouter();
  const [v, setV] = useState({
    ...initial,
    heightCm: initial.heightCm?.toString() ?? "",
    calorieTarget: String(initial.calorieTarget),
    proteinTargetG: String(initial.proteinTargetG),
    targetWeightKg: initial.targetWeightKg?.toString() ?? "",
  });
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "error"; message?: string }>({ kind: "idle" });
  const set = (patch: Partial<typeof v>) => {
    setV((old) => ({ ...old, ...patch }));
    setStatus({ kind: "idle" });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const calorieTarget = parseNumber(v.calorieTarget);
    const proteinTargetG = parseNumber(v.proteinTargetG);
    if (calorieTarget === null || calorieTarget < 1200) {
      return setStatus({ kind: "error", message: "每日热量目标不能低于 1200 kcal" });
    }
    if (proteinTargetG === null) return setStatus({ kind: "error", message: "请填写蛋白质目标" });
    setStatus({ kind: "busy" });
    try {
      await request("PUT", "/api/profile", {
        displayName: v.displayName,
        sex: v.sex,
        birthDate: v.birthDate || null,
        heightCm: parseNumber(v.heightCm),
        timezone: v.timezone,
        activityLevel: v.activityLevel,
        estimateStyle: v.estimateStyle,
        calorieTarget: Math.round(calorieTarget),
        proteinTargetG: Math.round(proteinTargetG),
        targetWeightKg: parseNumber(v.targetWeightKg),
      });
      setStatus({ kind: "ok", message: "已保存" });
      router.refresh();
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 lg:space-y-4">
      <section className="card card-list">
        <h2 className="pb-1 pt-3 text-sm font-semibold text-accent">目标</h2>
        <div className="divide-y divide-line">
          <Row label="每日热量" hint={bmrHint ?? undefined}>
            <input className={inputClass} inputMode="numeric" value={v.calorieTarget} onChange={(e) => set({ calorieTarget: e.target.value })} />
          </Row>
          <Row label="每日蛋白质" hint="克">
            <input className={inputClass} inputMode="numeric" value={v.proteinTargetG} onChange={(e) => set({ proteinTargetG: e.target.value })} />
          </Row>
          <Row label="目标体重" hint="kg">
            <input className={inputClass} inputMode="decimal" value={v.targetWeightKg} onChange={(e) => set({ targetWeightKg: e.target.value })} />
          </Row>
        </div>
      </section>

      <section className="card">
        <h2 className="text-sm font-semibold text-accent">AI 估算风格</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">拍照、语音和调整时，遇到看不清的地方往哪边取。看得清的食物三档结果一样。只影响之后的记录。</p>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-bg p-1">
          {ESTIMATE_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => set({ estimateStyle: style })}
              aria-pressed={v.estimateStyle === style}
              className={`rounded-xl py-2.5 text-sm transition-colors ${v.estimateStyle === style ? "bg-card font-bold text-accent shadow-card" : "text-muted"}`}
            >
              {ESTIMATE_STYLE[style].label}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed">{ESTIMATE_STYLE[v.estimateStyle].hint}</p>
      </section>

      <section className="card card-list">
        <h2 className="pb-1 pt-3 text-sm font-semibold text-accent">个人资料</h2>
        <div className="divide-y divide-line">
          <Row label="称呼">
            <input className={`${inputClass} w-40`} value={v.displayName} maxLength={30} onChange={(e) => set({ displayName: e.target.value })} />
          </Row>
          <Row label="性别">
            <select className={inputClass} value={v.sex ?? ""} onChange={(e) => set({ sex: (e.target.value || null) as ProfileValues["sex"] })}>
              <option value="">未填</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </Row>
          <Row label="出生日期">
            <input type="date" className={`${inputClass} w-44`} value={v.birthDate ?? ""} onChange={(e) => set({ birthDate: e.target.value })} />
          </Row>
          <Row label="身高" hint="cm">
            <input className={inputClass} inputMode="decimal" value={v.heightCm} onChange={(e) => set({ heightCm: e.target.value })} />
          </Row>
          <Row label="活动水平" hint="没录手表消耗的日子按它估算">
            <select className={`${inputClass} w-44 text-left`} value={v.activityLevel} onChange={(e) => set({ activityLevel: e.target.value as ActivityLevel })}>
              {(Object.keys(ACTIVITY) as ActivityLevel[]).map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY[k].label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="时区" hint="决定每天从几点算起">
            <input className={`${inputClass} w-44`} value={v.timezone} autoCapitalize="none" onChange={(e) => set({ timezone: e.target.value })} />
          </Row>
        </div>
      </section>

      {status.message && <p className={`text-center text-sm ${status.kind === "error" ? "text-warn" : "text-accent"}`}>{status.message}</p>}
      <button className="btn-primary w-full" disabled={status.kind === "busy"}>
        {status.kind === "busy" ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
