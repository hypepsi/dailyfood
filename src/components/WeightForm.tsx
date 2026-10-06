"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { parseNumber, request } from "@/lib/client-api";

const EXTRA_FIELDS = [
  { key: "bodyFatPct", label: "体脂率 %" },
  { key: "waistCm", label: "腰围 cm" },
  { key: "muscleKg", label: "肌肉量 kg" },
  { key: "skeletalMuscleKg", label: "骨骼肌 kg" },
  { key: "visceralFat", label: "内脏脂肪等级" },
  { key: "bmrKcal", label: "基础代谢 kcal" },
] as const;

export function WeightForm({ today, lastWeight }: { today: string; lastWeight: number | null }) {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [showExtra, setShowExtra] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { date, weightKg: parseNumber(weight) };
      for (const f of EXTRA_FIELDS) payload[f.key] = parseNumber(extra[f.key] ?? "");
      await request("POST", "/api/metrics", payload);
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const hasAny = weight.trim() || Object.values(extra).some((v) => v.trim());

  return (
    <form onSubmit={submit} className="rounded-[28px] border border-line bg-card p-5 shadow-card">
      <label className="block text-sm text-faint" htmlFor="weight">
        体重（kg）
      </label>
      <input
        id="weight"
        className="num w-full bg-transparent py-2 text-5xl font-bold text-accent-deep outline-none placeholder:text-line"
        inputMode="decimal"
        autoFocus
        placeholder={lastWeight ? lastWeight.toFixed(1) : "0.0"}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      {parseNumber(weight) ? <p className="text-sm text-accent">≈ {(parseNumber(weight)! * 2).toFixed(1)} 斤</p> : null}

      <button type="button" className="mt-4 flex items-center text-sm text-muted" onClick={() => setShowExtra((v) => !v)}>
        更多指标（体脂、腰围等，可不填）
        <ChevronDown size={16} className={`ml-1 transition-transform ${showExtra ? "rotate-180" : ""}`} />
      </button>
      {showExtra && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {EXTRA_FIELDS.map((f) => (
            <label key={f.key} className="block rounded-2xl bg-bg px-3 py-2">
              <span className="block text-xs text-faint">{f.label}</span>
              <input
                className="num w-full bg-transparent outline-none"
                inputMode="decimal"
                value={extra[f.key] ?? ""}
                onChange={(e) => setExtra((x) => ({ ...x, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="col-span-2 block rounded-2xl bg-bg px-3 py-2">
            <span className="block text-xs text-faint">日期</span>
            <input type="date" className="w-full bg-transparent outline-none" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      <button className="btn-primary mt-5 w-full" disabled={busy || !hasAny}>
        {busy ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
