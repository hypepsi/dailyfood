"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ImageUp, TriangleAlert } from "lucide-react";
import { CORE_METRICS, EXTRA_METRICS } from "@/lib/body-report";
import { request } from "@/lib/client-api";
import { compressImage } from "@/lib/compress-image";

type Result = {
  id: number;
  date: string;
  replaced: boolean;
  core: Record<string, number | null>;
  extra: Record<string, number>;
  warnings: string[];
};

const dateLabel = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** 上传体脂秤报告截图，AI 读取后自动记录；这里只负责选图和展示结果 */
export function ReportUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      // 报告是小字，压缩时保留更高分辨率
      form.append("image", await compressImage(file, 2000, 0.92), "report.jpg");
      setResult(await request<Result>("POST", "/api/metrics/report", form));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result) return;
    // 覆盖了当天原有记录时，删除后原来的那条也回不来，先说清楚
    if (result.replaced && !window.confirm("这份报告已经覆盖了当天原来的记录。删除后这一天将没有数据，确定删除吗？")) return;
    await request("DELETE", `/api/metrics/${result.id}`).catch(() => null);
    setResult(null);
    router.refresh();
  }

  const metrics: { key: string; label: string; unit: string; from: "core" | "extra" }[] = [
    ...Object.entries(CORE_METRICS).map(([key, meta]) => ({ key, ...meta, from: "core" as const })),
    ...Object.entries(EXTRA_METRICS).map(([key, meta]) => ({ key, ...meta, from: "extra" as const })),
  ];
  const values = result
    ? metrics.flatMap((m) => {
        const value = result[m.from][m.key];
        return typeof value === "number" ? [{ label: m.label, unit: m.unit, value }] : [];
      })
    : [];

  return (
    <section className="card">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button className="btn-primary w-full py-4 text-[17px]" disabled={busy} onClick={() => input.current?.click()}>
        <ImageUp size={21} />
        {busy ? "正在读取报告…" : "上传体脂秤报告"}
      </button>
      {!result && !error && (
        <p className="mt-2.5 text-center text-[13px] text-faint">选一张报告截图，体重和各项指标会自动记录</p>
      )}
      {error && <p className="mt-2.5 text-center text-sm text-warn">{error}</p>}

      {result && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 font-semibold text-accent-deep">
            <CircleCheck size={18} className="text-accent" />
            已{result.replaced ? "更新" : "记录"} {dateLabel(result.date)} 的数据
          </p>
          {result.warnings.map((w) => (
            <p key={w} className="mt-2 flex items-start gap-1.5 rounded-xl bg-warn-tint px-3 py-2 text-sm text-warn">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
            {values.map((v) => (
              <div key={v.label}>
                <dt className="text-xs text-faint">{v.label}</dt>
                <dd className="num text-[15px] font-semibold">
                  {v.value}
                  {v.unit && <span className="ml-0.5 text-xs font-normal text-muted">{v.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <button className="mt-3 text-[13px] text-faint underline" onClick={undo}>
            {result.replaced ? "读得不对？删除这条记录" : "读得不对？撤销这次记录"}
          </button>
        </div>
      )}
    </section>
  );
}
