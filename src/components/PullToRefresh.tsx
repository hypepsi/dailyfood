"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Check, LoaderCircle } from "lucide-react";

/** 手指要拉过这个距离（像素）才会触发刷新 */
const THRESHOLD = 70;
/** 提示条最多跟着下来多远 */
const MAX_PULL = 110;

type Phase = "idle" | "pulling" | "ready" | "refreshing" | "done";

const TEXT: Record<Exclude<Phase, "idle">, string> = {
  pulling: "下拉刷新",
  ready: "松开立即刷新",
  refreshing: "正在刷新…",
  done: "已是最新",
};

/**
 * 下拉刷新。页面已经禁用了浏览器自带的下拉刷新（否则会带出左右晃动和回弹），
 * 所以这里自己实现：在页面顶部向下拉 → 顶部滑出提示 → 拉过阈值后松手 → 重新向服务器取数据。
 * 刷新只重新获取页面数据，不会清空正在填写的表单。
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const startedAt = useRef(0);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    function onStart(e: TouchEvent) {
      // 只在页面已经滚到最顶部、且没有打开全屏浮层（录音、识别中）时才开始
      const target = e.target as Element | null;
      if (window.scrollY > 0 || phaseRef.current === "refreshing" || target?.closest("[data-no-pull]")) return;
      startY.current = e.touches[0].clientY;
    }

    function onMove(e: TouchEvent) {
      if (startY.current === null) return;
      const distance = e.touches[0].clientY - startY.current;
      if (distance <= 0 || window.scrollY > 0) {
        // 往上滑或页面已经开始滚动：这次不是下拉刷新
        if (phaseRef.current !== "idle") go("idle");
        setPull(0);
        if (distance < -10) startY.current = null;
        return;
      }
      // 越拉越“重”，提示条不会跟着手指一直往下跑
      setPull(Math.min(MAX_PULL, distance * 0.5));
      go(distance * 0.5 >= THRESHOLD ? "ready" : "pulling");
    }

    function onEnd() {
      if (startY.current === null) return;
      startY.current = null;
      if (phaseRef.current === "ready") {
        go("refreshing");
        setPull(THRESHOLD);
        startedAt.current = Date.now();
        startTransition(() => router.refresh());
      } else if (phaseRef.current === "pulling") {
        go("idle");
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  // 数据取回来以后：转圈至少停留半秒（太快会像没反应），再显示“已是最新”
  useEffect(() => {
    if (phase !== "refreshing" || pending) return;
    const timer = setTimeout(() => go("done"), Math.max(0, 500 - (Date.now() - startedAt.current)));
    return () => clearTimeout(timer);
  }, [phase, pending]);

  // “已是最新”停留片刻后收起
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => {
      go("idle");
      setPull(0);
    }, 900);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;
  const dragging = phase === "pulling" || phase === "ready";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
      style={{
        transform: `translateY(${pull - 48}px)`,
        opacity: Math.min(1, pull / 40),
        transition: dragging ? "none" : "transform 0.25s var(--ease), opacity 0.25s",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-card ${phase === "done" ? "border-transparent bg-accent text-white" : "border-line bg-card text-ink"}`}>
        {dragging && <ArrowDown size={16} className="text-accent transition-transform duration-200" style={{ transform: phase === "ready" ? "rotate(180deg)" : undefined }} />}
        {phase === "refreshing" && <LoaderCircle size={16} className="animate-spin text-accent" />}
        {phase === "done" && <Check size={16} strokeWidth={3} />}
        {TEXT[phase]}
      </div>
    </div>
  );
}
