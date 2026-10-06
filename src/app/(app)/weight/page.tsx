import { History } from "lucide-react";
import { Card } from "@/components/Card";
import { DeleteButton } from "@/components/DeleteButton";
import { PageHeader } from "@/components/PageHeader";
import { WeightForm } from "@/components/WeightForm";
import type { BodyMetric } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { formatDateCn } from "@/lib/time";
import { todayFor } from "@/services/meals";
import { getLatest, listMetrics } from "@/services/metrics";

function details(m: BodyMetric): string {
  return [
    m.bodyFatPct !== null && `体脂 ${m.bodyFatPct}%`,
    m.waistCm !== null && `腰围 ${m.waistCm} cm`,
    m.muscleKg !== null && `肌肉 ${m.muscleKg} kg`,
    m.skeletalMuscleKg !== null && `骨骼肌 ${m.skeletalMuscleKg} kg`,
    m.visceralFat !== null && `内脏脂肪 ${m.visceralFat}`,
    m.bmrKcal !== null && `基础代谢 ${m.bmrKcal} kcal`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function WeightPage() {
  const user = await requireUser();
  const today = todayFor(user);
  const history = listMetrics(user);

  return (
    <>
      <PageHeader title="记体重" />
      <div className="space-y-4">
        <WeightForm today={today} lastWeight={getLatest(user, "weightKg")?.value ?? null} />
        {history.length > 0 && (
          <Card icon={History} title="历史记录">
            <ul className="divide-y divide-line">
              {history.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-faint">{formatDateCn(m.localDate)}</div>
                    {details(m) && <div className="mt-0.5 text-sm text-muted">{details(m)}</div>}
                  </div>
                  {m.weightKg !== null && <span className="num text-lg font-semibold">{m.weightKg} kg</span>}
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
