"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { request } from "@/lib/client-api";

/** 用一句话描述吃了什么，让 AI 估算，再进入确认页 */
export function DescribeMeal({ date, isToday }: { date: string; isToday: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("text", text);
      if (!isToday) form.append("date", date);
      const { id } = await request<{ id: number }>("POST", "/api/meals/analyze", form);
      router.replace(`/meal/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-line bg-card p-5 shadow-card">
      <h2 className="mb-3 font-semibold">说一下吃了什么</h2>
      <textarea
        className="field min-h-24 resize-none"
        placeholder="例如：一碗牛肉面，加了一个卤蛋，汤没喝"
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
      <button className="btn-primary mt-3 w-full" onClick={submit} disabled={busy || !text.trim()}>
        <Sparkles size={18} />
        {busy ? "估算中…" : "让 AI 估算"}
      </button>
    </section>
  );
}
