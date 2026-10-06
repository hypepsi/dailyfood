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
const STAPLE = /饭|面条|[拉汤炒拌凉挂]面|面$|意面|米线|米粉|河粉|馒头|花卷|烧饼|煎饼|饼$|粥|包子|饺子|馄饨|面包|吐司|主食|年糕|粽子|红薯|燕麦/;
export const isStaple = (name: string) => STAPLE.test(name);

type Props = {
  mealId: number;
  items: { name: string; quantity: string; eaten: number }[];
  /** 每样食物的新比例；null 表示这一样不变 */
  onApply: (fractions: (number | null)[]) => void;
};

/**
 * 修正：吃完才发现没吃完时，告诉系统实际吃了多少。
 * 快捷按钮由程序直接换算；语音或文字交给 AI 理解成每样食物的比例。
 * 这里只改界面上的数值，点「保存修改」后才生效。
 */
export function PortionFix({ mealId, items, onApply }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const hasStaple = items.some((i) => isStaple(i.name));
  const all = (fraction: number) => items.map(() => fraction);
  const staples = (fraction: number) => items.map((i) => (isStaple(i.name) ? fraction : null));

  const quick = [
    { label: "都吃完了", fractions: all(1) },
    { label: "整体吃了 ¾", fractions: all(0.75) },
    { label: "整体吃了一半", fractions: all(0.5) },
    ...(hasStaple
      ? [
          { label: "主食剩一半", fractions: staples(0.5) },
          { label: "主食没吃", fractions: staples(0) },
        ]
      : []),
  ];

  const interpret = useCallback(
    async (input: { audio?: Blob; text?: string }) => {
      const form = new FormData();
      form.append("items", JSON.stringify(items.filter((i) => i.name.trim()).map(({ name, quantity }) => ({ name, quantity }))));
      if (input.audio) form.append("audio", input.audio, "speech");
      if (input.text) form.append("text", input.text);
      const result = await request<{ heard: string; fractions: (number | null)[]; summary: string }>("POST", `/api/meals/${mealId}/adjust`, form);
      // 没填名称的行没有发给 AI，这里把结果对回原来的行
      let next = 0;
      onApply(items.map((i) => (i.name.trim() ? (result.fractions[next++] ?? null) : null)));
      setMessage({ ok: true, text: `「${result.heard}」→ ${result.summary}` });
      setText("");
      setListening(false);
    },
    [items, mealId, onApply],
  );

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await interpret({ text });
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
          <h2 className="text-[17px] font-bold">修正</h2>
          <p className="text-xs text-muted">没吃完？告诉我实际吃了多少</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            onClick={() => {
              onApply(q.fractions);
              setMessage({ ok: true, text: `已按「${q.label}」调整，点下面的「保存修改」生效` });
            }}
            className="rounded-full border border-line bg-bg px-3.5 py-2 text-sm font-semibold transition active:scale-95 active:bg-line"
          >
            {q.label}
          </button>
        ))}
      </div>

      <form onSubmit={submitText} className="mt-3 flex gap-2">
        <button
          type="button"
          aria-label="语音修正"
          onClick={() => {
            setMessage(null);
            setListening(true);
          }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-white transition active:scale-95"
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

      {message && <p className={`mt-2.5 text-sm ${message.ok ? "text-accent-deep" : "text-warn"}`}>{message.text}</p>}

      {listening && (
        <VoiceOverlay title="正在听，说说实际吃了多少" onRecorded={(audio) => interpret({ audio })} onClose={() => setListening(false)} />
      )}
    </section>
  );
}
