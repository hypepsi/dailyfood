"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { request } from "@/lib/client-api";

type Status = { running: boolean; error: string | null };

/**
 * 生成分析的按钮。分析在服务器后台跑（要一分钟左右），这里每隔几秒问一次，好了就刷新页面。
 * 中途离开页面也没关系，回来时会接着显示“正在分析”。
 */
export function ReviewRunner({ label, initiallyRunning }: { label: string; initiallyRunning: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(initiallyRunning);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(async () => {
      try {
        const status = await request<Status>("GET", "/api/review");
        if (status.running) return;
        setBusy(false);
        if (status.error) setError(status.error);
        else router.refresh();
      } catch {
        // 网络抖一下不要紧，下一轮再问
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [busy, router]);

  async function run() {
    setError("");
    try {
      await request<Status>("POST", "/api/review");
      setBusy(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <button className="btn-primary w-full py-4 text-[17px]" onClick={run} disabled={busy}>
        <Sparkles size={20} className={busy ? "animate-pulse" : ""} />
        {busy ? "正在分析这 7 天的数据…" : label}
      </button>
      {busy && <p className="mt-2 text-center text-[13px] text-muted">大约需要一分钟。可以先去做别的，回来就能看到</p>}
      {error && <p className="mt-2 text-center text-sm text-warn">{error}</p>}
    </div>
  );
}
