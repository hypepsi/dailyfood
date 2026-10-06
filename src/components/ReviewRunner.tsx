"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { request } from "@/lib/client-api";

/** 生成复盘的按钮。分析 7 天的全部数据需要半分钟左右，等待时给出明确提示 */
export function ReviewRunner({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      await request("POST", "/api/review");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn-primary w-full py-4 text-[17px]" onClick={run} disabled={busy}>
        <Sparkles size={20} className={busy ? "animate-pulse" : ""} />
        {busy ? "正在分析这 7 天的数据…" : label}
      </button>
      {busy && <p className="mt-2 text-center text-[13px] text-muted">大约需要半分钟，请不要离开这个页面</p>}
      {error && <p className="mt-2 text-center text-sm text-warn">{error}</p>}
    </div>
  );
}
