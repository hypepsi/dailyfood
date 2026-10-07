"use client";

import { useCallback, useState } from "react";
import { Mic, PencilRuler } from "lucide-react";
import { request } from "@/lib/client-api";
import { VoiceOverlay } from "./VoiceOverlay";

/** 每样食物上的“实际吃了多少”选项 */
export const EATEN_OPTIONS = [
  { value: 1, label: "全部" },
  { value: 0.75, label: "¾" },
  { value: 0.5, label: "一半" },
  { value: 0.25, label: "¼" },
  { value: 0, label: "没吃" },
];

export function fractionLabel(fraction: number): string {
  return EATEN_OPTIONS.find((o) => o.value === fraction)?.label ?? `${Math.round(fraction * 100)}%`;
}

/** 名字像主食的食物：用于“主食剩一半”这类快捷修正 */
const STAPLE = /饭|面条|[拉汤炒拌凉挂]面|面$|意面|乌冬|米线|米粉|河粉|馒头|花卷|烧饼|煎饼|饼$|粥|包子|饺子|馄饨|面包|吐司|主食|年糕|粽子|红薯|燕麦/;
export const isStaple = (name: string) => STAPLE.test(name);

export type AdjustItem = { name: string; quantity: string; weightG: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number };

/** AI 给出的修改方案，下标对应传给它的清单 */
export type AdjustResult = {
  heard: string;
  summary: string;
  updates: { index: number; item: AdjustItem }[];
  adds: AdjustItem[];
  removes: number[];
  portions: { index: number; fraction: number }[];
  title: string | null;
  people: number | null;
};

type Props = {
  mealId: number;
  /** draft=刚识别完还没确认；edit=已经记录过 */
  mode: "draft" | "edit";
  items: (AdjustItem & { eaten: number })[];
  /** 应用 AI 的修改方案；rowIndexes 把方案里的下标对回编辑页的行 */
  onResult: (result: AdjustResult, rowIndexes: number[]) => void;
  /** 快捷按钮：每样食物的新比例，null 表示这一样不变 */
  onPortions: (fractions: (number | null)[]) => void;
};

/**
 * 调整：识别得不对、漏了、多了、没吃完，说一句或写一句就行。
 * 例如“面条是乌冬面”只会改面条那一项并重新估算，其余不动。
 * 这里只改界面上的数值，点确认/保存后才生效。
 */
export function MealAdjust({ mealId, mode, items, onResult, onPortions }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const hasStaple = items.some((i) => isStaple(i.name));
  const all = (fraction: number) => items.map(() => fraction);
  const staples = (fraction: number) => items.map((i) => (isStaple(i.name) ? fraction : null));
  // 没吃完的快捷按钮只在已经记录的饭上出现；刚拍完还没吃，用不上
  const quick =
    mode === "edit"
      ? [
          { label: "都吃完了", fractions: all(1) },
          { label: "整体吃了 ¾", fractions: all(0.75) },
          { label: "整体吃了一半", fractions: all(0.5) },
          ...(hasStaple
            ? [
                { label: "主食剩一半", fractions: staples(0.5) },
                { label: "主食没吃", fractions: staples(0) },
              ]
            : []),
        ]
      : [];

  const ask = useCallback(
    async (input: { audio?: Blob; text?: string }) => {
      // 没填名称的行不发给 AI；记下发出去的每一项对应编辑页的第几行
      const rowIndexes = items.map((i, n) => (i.name.trim() ? n : -1)).filter((n) => n >= 0);
      const form = new FormData();
      form.append("items", JSON.stringify(rowIndexes.map((n) => { const { eaten: _e, ...item } = items[n]; return item; })));
      if (input.audio) form.append("audio", input.audio, "speech");
      if (input.text) form.append("text", input.text);
      const result = await request<AdjustResult>("POST", `/api/meals/${mealId}/adjust`, form);
      onResult(result, rowIndexes);
      setMessage({ ok: true, text: `「${result.heard}」→ ${result.summary}` });
      setText("");
      setListening(false);
    },
    [items, mealId, onResult],
  );

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await ask({ text });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="fix" className="card scroll-mt-4">
      <header className="mb-3 flex items-center gap-2.5">
        <span className="icon-tile">
          <PencilRuler size={18} strokeWidth={2.5} />
        </span>
        <div>
          <h2 className="text-[17px] font-bold">{mode === "draft" ? "识别得不对？" : "修正"}</h2>
          <p className="text-xs text-muted">{mode === "draft" ? "说一句或写一句，只改你提到的那一样" : "认错了、漏了、没吃完，说一句或写一句"}</p>
        </div>
      </header>

      {quick.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => {
                onPortions(q.fractions);
                setMessage({ ok: true, text: `已按「${q.label}」调整，点下面的「保存修改」生效` });
              }}
              className="rounded-full border border-line bg-bg px-3.5 py-2 text-sm font-semibold transition active:scale-95 active:bg-line"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submitText} className="flex gap-2">
        <button
          type="button"
          aria-label="语音调整"
          disabled={busy}
          onClick={() => {
            setMessage(null);
            setListening(true);
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white transition active:scale-95 disabled:opacity-50"
        >
          <Mic size={20} />
        </button>
        <input className="field min-w-0 flex-1 py-2.5" placeholder="或者写一句" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() && (
          <button className="btn-secondary shrink-0 px-4" disabled={busy}>
            {busy ? "…" : "应用"}
          </button>
        )}
      </form>

      {busy && <p className="mt-2.5 animate-pulse text-sm text-muted">正在按你说的调整并重新估算…</p>}
      {message && !busy && <p className={`mt-2.5 text-sm leading-relaxed ${message.ok ? "text-accent-deep" : "text-warn"}`}>{message.text}</p>}

      {listening && <VoiceOverlay title="正在听，说说哪里不对" onRecorded={(audio) => ask({ audio })} onClose={() => setListening(false)} />}
    </section>
  );
}
