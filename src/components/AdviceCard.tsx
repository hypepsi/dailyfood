"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/** 今日简短建议。异步加载，不阻塞首页；失败就不显示 */
export function AdviceCard({ refreshKey }: { refreshKey: string }) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/advice")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setAdvice(d?.advice ?? null))
      .catch(() => !cancelled && setAdvice(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!loading && !advice) return null;
  return (
    <section className="flex gap-3 rounded-[28px] bg-tint p-5">
      <Sparkles size={20} className="mt-0.5 shrink-0 text-accent" />
      <p className={`leading-relaxed text-accent-deep ${loading ? "animate-pulse" : ""}`}>
        {loading ? "正在看今天的记录…" : advice}
      </p>
    </section>
  );
}
