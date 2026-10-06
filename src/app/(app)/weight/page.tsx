import { History } from "lucide-react";
import { Card } from "@/components/Card";
import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { ReportUpload } from "@/components/ReportUpload";
import { WeightForm } from "@/components/WeightForm";
import type { BodyMetric } from "@/db/schema";
import { CORE_METRICS, EXTRA_METRICS, parseExtra } from "@/lib/body-report";
import { requireUser } from "@/lib/session";
import { formatDateCn } from "@/lib/time";
import { todayFor } from "@/services/meals";
import { getLatest, listMetrics } from "@/services/metrics";

/** 一条记录里除体重外的所有指标，拼成一行小字 */
function details(m: BodyMetric): string {
  const extra = parseExtra(m.extra);
  const core = (Object.keys(CORE_METRICS) as (keyof typeof CORE_METRICS)[])
    .filter((k) => k !== "weightKg" && m[k] !== null)
    .map((k) => `${CORE_METRICS[k].label} ${m[k]}${CORE_METRICS[k].unit}`);
  const rest = (Object.keys(EXTRA_METRICS) as (keyof typeof EXTRA_METRICS)[])
    .filter((k) => extra[k] !== undefined)
    .map((k) => `${EXTRA_METRICS[k].label} ${extra[k]}${EXTRA_METRICS[k].unit}`);
  return [...core, ...rest].join(" · ");
}

export default async function WeightPage() {
  const user = await requireUser();
  const today = todayFor(user);
  const history = listMetrics(user);

  return (
    <>
      <PageHeader title="身体数据" />
      <div className="space-y-3">
        <ReportUpload />

        <details className="rounded-3xl border border-line bg-card shadow-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-center text-sm text-muted">没有报告？手动输入</summary>
          <div className="px-4 pb-4">
            <WeightForm today={today} lastWeight={getLatest(user, "weightKg")?.value ?? null} />
          </div>
        </details>

        {history.length > 0 && (
          <Card icon={History} title="历史记录">
            <ul className="divide-y divide-line">
              {history.map((m) => (
                <li key={m.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] text-faint">{formatDateCn(m.localDate)}</span>
                      {m.weightKg !== null && <span className="num text-base font-semibold">{m.weightKg} kg</span>}
                    </div>
                    {details(m) && <div className="num mt-1 text-[13px] leading-relaxed text-muted">{details(m)}</div>}
                  </div>
                  <DeleteButton url={`/api/metrics/${m.id}`} confirmText="确定删除这条记录吗？" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
