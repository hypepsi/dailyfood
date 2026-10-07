import { AccountActions } from "@/components/AccountActions";
import { GoalRecommendation } from "@/components/GoalRecommendation";
import { SettingsForm, type ProfileValues } from "@/components/SettingsForm";
import { ACTIVITY, recommendGoals } from "@/lib/goals";
import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/time";
import { buildSnapshot } from "@/services/snapshot";

export default async function SettingsPage() {
  const user = await requireUser();
  const { facts, weight, bodyFat } = buildSnapshot(user);
  const rec = recommendGoals(facts);

  const profile: ProfileValues = {
    displayName: user.displayName,
    sex: user.sex,
    birthDate: user.birthDate,
    heightCm: user.heightCm,
    timezone: user.timezone,
    activityLevel: user.activityLevel,
    estimateStyle: user.estimateStyle,
    calorieTarget: user.calorieTarget,
    proteinTargetG: user.proteinTargetG,
    targetWeightKg: user.targetWeightKg,
  };

  const basis = rec
    ? [
        `体重 ${facts.weightKg} kg${weight.avg7Kg !== null ? "（近 7 日平均）" : weight.latestDate ? `（${shortDate(weight.latestDate)} 记录）` : ""}` +
          (bodyFat ? `，体脂率 ${bodyFat.value}%` : ""),
        `基础代谢 ${rec.bmr} kcal（${rec.bmrSource}）× 活动系数 ${ACTIVITY[facts.activityLevel].factor} ≈ 每日消耗 ${rec.tdee} kcal`,
        `热量：每日消耗 − 500，约每周减 0.45 kg，且不低于基础代谢`,
        `蛋白质：${rec.proteinBasis}`,
      ]
    : [];

  return (
    <div className="space-y-3 lg:space-y-4">
      <h1 className="page-title flex h-11 items-center justify-center">我的</h1>
      {rec ? (
        <GoalRecommendation profile={profile} recommended={{ calorieTarget: rec.calorieTarget, proteinTargetG: rec.proteinTargetG }} basis={basis} />
      ) : (
        <p className="card-tint text-sm">上传一次体脂秤报告，并填好性别、出生日期和身高后，这里会给出推荐的每日目标。</p>
      )}
      <SettingsForm key={user.updatedAt} initial={profile} bmrHint={rec ? `不建议低于基础代谢 ${rec.bmr} kcal` : null} />
      <AccountActions username={user.username} />
    </div>
  );
}
