"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { MealAdjust, EATEN_OPTIONS, fractionLabel, type AdjustItem, type AdjustResult } from "./MealAdjust";
import { MealPhotos } from "./MealPhotos";
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
  personal?: boolean;
  eatenFraction?: number;
  confidence?: "high" | "medium" | "low";
};

type Props = {
  /** draft=确认 AI 识别结果；edit=修改已确认记录；new=纯手动新建 */
  mode: "draft" | "edit" | "new";
  mealId?: number;
  /** 这顿饭已有几张照片 */
  photoCount?: number;
  today: string;
  initial: { mealType: MealType; date: string; time: string; people: number; items: EditorItem[] };
  estimate?: { totalKcal: number; kcalLow: number; kcalHigh: number; note: string; peopleHint?: number; questions: { question: string; options: string[] }[] };
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
  /** 多人分食时，这一项只有自己吃 */
  personal: boolean;
  /** 实际吃掉的比例，1 = 全吃了 */
  eaten: number;
  /** 当前这组营养数值对应的食物名称；名称被改掉后提示“按新名称重新估算” */
  estimatedFor: string;
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
    personal: item.personal ?? false,
    eaten: item.eatenFraction ?? 1,
    estimatedFor: item.name,
    confidence: item.confidence,
    open: false,
    base: item.weightG ? { weight: item.weightG, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG } : null,
  };
}

const emptyRow = (): Row => ({ key: nextKey++, name: "", quantity: "", weight: "", kcal: "", protein: "", carbs: "", fat: "", personal: false, eaten: 1, estimatedFor: "", open: true, base: null });

const num = (s: string) => parseNumber(s) ?? 0;

function snapshotBase(row: Row): Row["base"] {
  const weight = parseNumber(row.weight);
  return weight && weight > 0 ? { weight, kcal: num(row.kcal), protein: num(row.protein), carbs: num(row.carbs), fat: num(row.fat) } : null;
}

export function MealEditor({ mode, mealId, photoCount = 0, today, initial, estimate }: Props) {
  const router = useRouter();
  const [mealType, setMealType] = useState(initial.mealType);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [people, setPeople] = useState(initial.people);
  // AI 调整时如果食物种类变了，会顺带给这顿饭起一个新名称
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>(() => (initial.items.length ? initial.items.map(toRow) : [emptyRow()]));
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "refine" | "delete">("");
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState<number | null>(null);

  // 明细是整桌的量；“我的份”= 整桌 ÷ 人数
  const tableKcal = Math.round(rows.reduce((s, r) => s + num(r.kcal), 0));
  const mine = (pick: (r: Row) => string) => rows.reduce((s, r) => s + (num(pick(r)) * r.eaten) / (r.personal ? 1 : people), 0);
  const corrected = rows.some((r) => r.eaten !== 1);
  const total = {
    kcal: Math.round(mine((r) => r.kcal)),
    protein: round1(mine((r) => r.protein)),
    carbs: round1(mine((r) => r.carbs)),
    fat: round1(mine((r) => r.fat)),
  };
  const hint = estimate?.peopleHint ?? 1;

  /** 名称改了（AI 认错了菜），或新加了一样还没填热量的食物：让 AI 按现在的名称估算这一项 */
  async function reestimate(row: Row) {
    setEstimating(row.key);
    setError("");
    try {
      const { item } = await request<{ item: { quantity: string; weightG: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number } }>(
        "POST",
        "/api/meals/estimate-item",
        { name: row.name.trim(), quantity: row.quantity.trim(), weightG: parseNumber(row.weight) },
      );
      update(row.key, estimated({ ...item, name: row.name.trim() }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEstimating(null);
    }
  }

  /** 把一样食物的估算结果写进一行：数值、换算基准都更新，并标记“已按这个名称估算过” */
  function estimated(item: AdjustItem): Partial<Row> {
    return {
      name: item.name,
      quantity: item.quantity,
      weight: str(item.weightG),
      kcal: String(item.kcal),
      protein: String(item.proteinG),
      carbs: String(item.carbsG),
      fat: String(item.fatG),
      estimatedFor: item.name,
      confidence: undefined,
      base: item.weightG ? { weight: item.weightG, kcal: item.kcal, protein: item.proteinG, carbs: item.carbsG, fat: item.fatG } : null,
    };
  }

  /** 应用“说一句”得到的修改方案：只动 AI 指出的那几行，其余原样保留 */
  function applyAdjust(result: AdjustResult, rowIndexes: number[]) {
    setRows((current) => {
      const rowAt = (index: number) => current[rowIndexes[index]];
      const patches = new Map<number, Partial<Row>>();
      for (const u of result.updates) if (rowAt(u.index)) patches.set(rowAt(u.index).key, { ...patches.get(rowAt(u.index).key), ...estimated(u.item) });
      for (const p of result.portions) if (rowAt(p.index)) patches.set(rowAt(p.index).key, { ...patches.get(rowAt(p.index).key), eaten: p.fraction });
      const removed = new Set(result.removes.map((i) => rowAt(i)?.key));
      const kept = current.filter((r) => !removed.has(r.key)).map((r) => (patches.has(r.key) ? { ...r, ...patches.get(r.key) } : r));
      const added = result.adds.map((item) => ({ ...emptyRow(), open: false, ...estimated(item) }));
      return [...kept, ...added];
    });
    if (result.title) setTitle(result.title);
    if (result.people) setPeople(result.people);
  }

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
        personal: people > 1 && r.personal,
        eatenFraction: r.eaten,
      });
    }
    if (items.length === 0) return setError("至少保留一项食物");
    if (date > today) return setError("不能记录未来的日期");
    // 名称改了但数值还是原来那样食物的：多半是忘了点“重新估算”
    const renamed = rows.filter((r) => r.estimatedFor && r.name.trim() !== r.estimatedFor);
    if (renamed.length > 0) {
      const names = renamed.map((r) => `「${r.name.trim()}」`).join("、");
      if (!window.confirm(`${names}改了名称，但热量还是按原来的食物算的。\n\n点「取消」回去按新名称重新估算；点「确定」就这样保存。`)) return;
    }

    setBusy("save");
    try {
      const payload = { mealType, date, time, people, title, items };
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

  // 交给 AI 对照用的当前清单（语音/文字调整、补拍照片都用它）
  const currentItems = rows.map((r) => ({ name: r.name, quantity: r.quantity, weightG: parseNumber(r.weight), kcal: num(r.kcal), proteinG: num(r.protein), carbsG: num(r.carbs), fatG: num(r.fat), eaten: r.eaten }));

  const questions = mode === "draft" ? (estimate?.questions ?? []) : [];

  return (
    <div className="space-y-3 pb-24">
      {mode !== "new" && mealId !== undefined && <MealPhotos mealId={mealId} initialCount={photoCount} items={currentItems} onResult={applyAdjust} />}

      {estimate && (
        <section className="card-tint">
          <div className="text-sm opacity-80">AI 估算{hint > 1 ? "（整桌）" : ""}</div>
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
        <section className="card">
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

      {mode !== "new" && mealId !== undefined && (
        <MealAdjust
          mealId={mealId}
          mode={mode}
          items={currentItems}
          onResult={applyAdjust}
          onPortions={(fractions) => setRows((rs) => rs.map((r, i) => (fractions[i] === null || fractions[i] === undefined ? r : { ...r, eaten: fractions[i] as number })))}
        />
      )}

      <section className="card">
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
        <div className="mt-3 flex gap-2">
          <input type="date" className="field min-w-0 flex-1 px-3" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="日期" />
          <input type="time" className="field w-32 shrink-0 px-3" value={time} onChange={(e) => setTime(e.target.value)} aria-label="时间" />
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">几个人一起吃？</span>
            {mode === "draft" && hint > 1 && people === 1 && <span className="text-[13px] text-warn">看起来像 {hint} 人的量</span>}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setPeople(n)}
                aria-pressed={people === n}
                className={`rounded-xl border py-2 text-sm ${people === n ? "border-accent bg-accent font-semibold text-white" : "border-line bg-bg text-muted"}`}
              >
                {n === 1 ? "就我" : `${n} 人`}
              </button>
            ))}
          </div>
          {people > 1 && (
            <p className="num mt-2 text-[13px] text-muted">
              下面按整桌填写，合吃的菜平均分成 {people} 份，只计入你的一份；自己单独吃的（比如自己那碗饭）点一下「合吃」改成「我自己的」。
            </p>
          )}
        </div>
      </section>

      {rows.map((row) => (
        <section key={row.key} className="card">
          <div className="flex items-center gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-faint"
              placeholder="食物名称"
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value })}
            />
            {people > 1 && (
              <button
                onClick={() => update(row.key, { personal: !row.personal })}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${row.personal ? "border-accent bg-tint text-accent-deep" : "border-line text-muted"}`}
              >
                {row.personal ? "我自己的" : "合吃"}
              </button>
            )}
            {row.confidence === "low" && <span className="shrink-0 rounded-full bg-warn-tint px-2.5 py-1 text-xs text-warn">不太确定</span>}
            <button aria-label="删除这一项" className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-faint active:bg-line" onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}>
              <Trash2 size={18} />
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <Field label="数量" value={row.quantity} onChange={(v) => update(row.key, { quantity: v })} />
            <Field label="重量 g" value={row.weight} onChange={(v) => changeWeight(row, v)} numeric />
            <Field label="热量 kcal" value={row.kcal} onChange={(v) => changeValue(row, "kcal", v)} numeric strong />
          </div>
          {row.name.trim() !== "" && row.name.trim() !== row.estimatedFor && (
            <button
              onClick={() => reestimate(row)}
              disabled={estimating !== null}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent bg-tint py-2.5 text-sm font-semibold text-accent-deep transition active:scale-[0.98] disabled:opacity-60"
            >
              <Sparkles size={16} className={estimating === row.key ? "animate-pulse" : ""} />
              {estimating === row.key ? "正在估算…" : row.estimatedFor ? `名称改了，按「${row.name.trim()}」重新估算` : `让 AI 估算「${row.name.trim()}」`}
            </button>
          )}
          {(mode === "edit" || row.eaten !== 1) && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <span className="mr-0.5 shrink-0 text-xs text-muted">{people > 1 && !row.personal ? "这盘吃掉" : "实际吃了"}</span>
              {[...EATEN_OPTIONS, ...(EATEN_OPTIONS.some((o) => o.value === row.eaten) ? [] : [{ value: row.eaten, label: fractionLabel(row.eaten) }])].map((o) => (
                <button
                  key={o.value}
                  onClick={() => update(row.key, { eaten: o.value })}
                  aria-pressed={row.eaten === o.value}
                  className={`flex-1 rounded-lg border py-1.5 text-xs transition-colors ${row.eaten === o.value ? "border-accent bg-accent font-bold text-white" : "border-line bg-bg text-muted"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {(row.eaten !== 1 || (people > 1 && !row.personal)) && (
            <p className="num mt-1.5 text-xs text-accent-deep">
              {people > 1 && !row.personal
                ? `整盘 ${Math.round(num(row.kcal))} ${row.eaten === 1 ? "" : `× ${fractionLabel(row.eaten)} `}÷ ${people} 人 = 我的一份 ${Math.round((num(row.kcal) * row.eaten) / people)} kcal`
                : `按${fractionLabel(row.eaten)}计入 ${Math.round(num(row.kcal) * row.eaten)} kcal（原 ${Math.round(num(row.kcal))}）`}
            </p>
          )}
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

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto max-w-md px-4 py-3 lg:max-w-lg">
          {error && <p className="mb-2 text-sm text-warn">{error}</p>}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="num text-2xl font-bold text-accent-deep">
                {total.kcal} <span className="text-sm font-semibold">kcal</span>
              </div>
              <div className="num text-xs text-faint">
                {people > 1
                  ? `我的一份 · 整桌共 ${tableKcal} kcal · ${people} 人`
                  : corrected
                    ? `已按实际吃的量修正 · 原 ${tableKcal} kcal`
                    : `蛋白 ${total.protein} · 碳水 ${total.carbs} · 脂肪 ${total.fat} g`}
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
