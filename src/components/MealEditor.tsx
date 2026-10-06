"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { MEAL_TYPES, type MealType } from "@/db/schema";
import { parseNumber, request } from "@/lib/client-api";
import { MEAL_LABELS, round1 } from "@/lib/nutrition";

export type EditorItem = {
  name: string;
  quantity: string;
  weightG: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence?: "high" | "medium" | "low";
};

type Props = {
  /** draft=确认 AI 识别结果；edit=修改已确认记录；new=纯手动新建 */
  mode: "draft" | "edit" | "new";
  mealId?: number;
  today: string;
  initial: { mealType: MealType; date: string; time: string; items: EditorItem[] };
  estimate?: { totalKcal: number; kcalLow: number; kcalHigh: number; note: string; questions: { question: string; options: string[] }[] };
};

type Row = {
  key: number;
  name: string;
  quantity: string;
  weight: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  confidence?: EditorItem["confidence"];
  open: boolean;
  /** 改重量时按这组数值等比例换算 */
  base: { weight: number; kcal: number; protein: number; carbs: number; fat: number } | null;
};

let nextKey = 1;
const str = (n: number | null) => (n === null ? "" : String(n));

function toRow(item: EditorItem): Row {
  return {
    key: nextKey++,
    name: item.name,
    quantity: item.quantity,
    weight: str(item.weightG),
    kcal: str(item.kcal),
    protein: str(item.proteinG),
    carbs: str(item.carbsG),
    fat: str(item.fatG),
    confidence: item.confidence,
    open: false,
    base: item.weightG ? { weight: item.weightG, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG } : null,
  };
}

const emptyRow = (): Row => ({ key: nextKey++, name: "", quantity: "", weight: "", kcal: "", protein: "", carbs: "", fat: "", open: true, base: null });

const num = (s: string) => parseNumber(s) ?? 0;

function snapshotBase(row: Row): Row["base"] {
  const weight = parseNumber(row.weight);
  return weight && weight > 0 ? { weight, kcal: num(row.kcal), protein: num(row.protein), carbs: num(row.carbs), fat: num(row.fat) } : null;
}

export function MealEditor({ mode, mealId, today, initial, estimate }: Props) {
  const router = useRouter();
  const [mealType, setMealType] = useState(initial.mealType);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [rows, setRows] = useState<Row[]>(() => (initial.items.length ? initial.items.map(toRow) : [emptyRow()]));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "refine" | "delete">("");
  const [error, setError] = useState("");

  const total = {
    kcal: Math.round(rows.reduce((s, r) => s + num(r.kcal), 0)),
    protein: round1(rows.reduce((s, r) => s + num(r.protein), 0)),
    carbs: round1(rows.reduce((s, r) => s + num(r.carbs), 0)),
    fat: round1(rows.reduce((s, r) => s + num(r.fat), 0)),
  };

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** 改重量：热量和营养素按比例跟着变 */
  function changeWeight(row: Row, text: string) {
    const w = parseNumber(text);
    if (row.base && w !== null && w > 0) {
      const ratio = w / row.base.weight;
      update(row.key, {
        weight: text,
        kcal: String(Math.round(row.base.kcal * ratio)),
        protein: String(round1(row.base.protein * ratio)),
        carbs: String(round1(row.base.carbs * ratio)),
        fat: String(round1(row.base.fat * ratio)),
      });
    } else {
      update(row.key, { weight: text });
    }
  }

  /** 直接改热量或营养素：以用户改后的值作为新的换算基准 */
  function changeValue(row: Row, field: "kcal" | "protein" | "carbs" | "fat", text: string) {
    const next = { ...row, [field]: text };
    update(row.key, { [field]: text, base: snapshotBase(next) });
  }

  async function save() {
    setError("");
    const items = [];
    for (const r of rows) {
      const kcal = parseNumber(r.kcal);
      if (!r.name.trim()) return setError("有一项食物还没有填名称");
      if (kcal === null || kcal < 0) return setError(`请填写「${r.name}」的热量`);
      items.push({
        name: r.name.trim(),
        quantity: r.quantity.trim(),
        weightG: parseNumber(r.weight),
        kcal,
        proteinG: num(r.protein),
        carbsG: num(r.carbs),
        fatG: num(r.fat),
      });
    }
    if (items.length === 0) return setError("至少保留一项食物");
    if (date > today) return setError("不能记录未来的日期");

    setBusy("save");
    try {
      const payload = { mealType, date, time, items };
      if (mode === "new") await request("POST", "/api/meals", payload);
      else await request("PUT", `/api/meals/${mealId}`, payload);
      router.push(date === today ? "/" : `/day/${date}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  async function refine() {
    if (!estimate) return;
    setBusy("refine");
    setError("");
    try {
      await request("POST", `/api/meals/${mealId}/refine`, {
        answers: Object.entries(answers).map(([i, answer]) => ({ question: estimate.questions[Number(i)].question, answer })),
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  async function remove() {
    if (mode === "edit" && !window.confirm("确定删除这顿饭吗？")) return;
    setBusy("delete");
    try {
      await request("DELETE", `/api/meals/${mealId}`);
      router.push(date === today ? "/" : `/day/${date}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  const questions = mode === "draft" ? (estimate?.questions ?? []) : [];

  return (
    <div className="space-y-3 pb-24">
      {estimate && (
        <section className="rounded-3xl bg-tint p-4 text-accent-deep">
          <div className="text-sm opacity-80">AI 估算</div>
          <div className="num mt-0.5 text-xl font-bold">
            约 {estimate.totalKcal} kcal
            <span className="ml-2 text-sm font-medium opacity-80">
              合理范围 {estimate.kcalLow}～{estimate.kcalHigh}
            </span>
          </div>
          {estimate.note && <p className="mt-2 text-sm leading-relaxed opacity-90">{estimate.note}</p>}
        </section>
      )}

      {questions.length > 0 && (
        <section className="rounded-3xl border border-line bg-card p-4 shadow-card">
          <p className="mb-3 text-sm text-faint">回答一下会更准，也可以直接跳过</p>
          {questions.map((q, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <div className="mb-2 font-medium">{q.question}</div>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAnswers((a) => ({ ...a, [i]: opt }))}
                    className={`rounded-full border px-4 py-2 text-sm ${answers[i] === opt ? "border-accent bg-accent text-white" : "border-line bg-bg"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(answers).length > 0 && (
            <button className="btn-secondary mt-4 w-full border-accent text-accent" onClick={refine} disabled={busy !== ""}>
              {busy === "refine" ? "重新估算中…" : "按回答更新估算"}
            </button>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-line bg-card p-4 shadow-card">
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-bg p-1">
          {MEAL_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setMealType(t)}
              className={`rounded-xl py-2.5 text-sm ${mealType === t ? "bg-card font-semibold text-accent shadow-card" : "text-muted"}`}
            >
              {MEAL_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-3">
          <input type="date" className="field flex-1" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="日期" />
          <input type="time" className="field w-36" value={time} onChange={(e) => setTime(e.target.value)} aria-label="时间" />
        </div>
      </section>

      {rows.map((row) => (
        <section key={row.key} className="rounded-3xl border border-line bg-card p-4 shadow-card">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-faint"
              placeholder="食物名称"
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value })}
            />
            {row.confidence === "low" && <span className="shrink-0 rounded-full bg-warn-tint px-2.5 py-1 text-xs text-warn">不太确定</span>}
            <button aria-label="删除这一项" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-faint active:bg-line" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
              <Trash2 size={18} />
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <Field label="数量" value={row.quantity} onChange={(v) => update(row.key, { quantity: v })} placeholder="如 1 碗" />
            <Field label="重量 g" value={row.weight} onChange={(v) => changeWeight(row, v)} numeric />
            <Field label="热量 kcal" value={row.kcal} onChange={(v) => changeValue(row, "kcal", v)} numeric strong />
          </div>
          {row.open ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="蛋白质 g" value={row.protein} onChange={(v) => changeValue(row, "protein", v)} numeric />
              <Field label="碳水 g" value={row.carbs} onChange={(v) => changeValue(row, "carbs", v)} numeric />
              <Field label="脂肪 g" value={row.fat} onChange={(v) => changeValue(row, "fat", v)} numeric />
            </div>
          ) : (
            <button className="num mt-2.5 flex w-full items-center text-[13px] text-faint" onClick={() => update(row.key, { open: true })}>
              蛋白质 {num(row.protein)} · 碳水 {num(row.carbs)} · 脂肪 {num(row.fat)} g
              <ChevronDown size={16} className="ml-1" />
            </button>
          )}
        </section>
      ))}

      <button className="btn-secondary w-full border-dashed py-4 text-muted" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
        <Plus size={18} />
        添加食物
      </button>

      {mode !== "new" && (
        <button className="w-full py-2 text-sm text-faint" onClick={remove} disabled={busy !== ""}>
          {busy === "delete" ? "处理中…" : mode === "draft" ? "放弃，不记录这顿" : "删除这顿饭"}
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:left-60">
        <div className="mx-auto max-w-md px-4 py-3 lg:max-w-xl lg:px-0">
          {error && <p className="mb-2 text-sm text-warn">{error}</p>}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="num text-2xl font-bold text-accent-deep">
                {total.kcal} <span className="text-sm font-semibold">kcal</span>
              </div>
              <div className="num text-xs text-faint">
                蛋白 {total.protein} · 碳水 {total.carbs} · 脂肪 {total.fat} g
              </div>
            </div>
            <button className="btn-primary px-8" onClick={save} disabled={busy !== ""}>
              {busy === "save" ? "保存中…" : mode === "edit" ? "保存修改" : "确认记录"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; strong?: boolean; placeholder?: string }) {
  return (
    <label className="block rounded-xl bg-bg px-3 py-1.5">
      <span className="block text-xs text-faint">{props.label}</span>
      <input
        className={`num w-full bg-transparent outline-none placeholder:text-faint ${props.strong ? "font-semibold text-accent-deep" : ""}`}
        inputMode={props.numeric ? "decimal" : undefined}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={(e) => props.numeric && e.target.select()}
      />
    </label>
  );
}
