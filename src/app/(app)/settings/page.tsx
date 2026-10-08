import { AccountActions } from "@/components/AccountActions";
import { GoalRecommendation, type PaceOption } from "@/components/GoalRecommendation";
import { SettingsForm, type ProfileValues } from "@/components/SettingsForm";
import { GOAL_PACES } from "@/db/schema";
import { ACTIVITY, PACES, recommendGoals } from "@/lib/goals";
import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/time";
import { buildSnapshot } from "@/services/snapshot";

export default async function SettingsPage() {
  const user = await requireUser();
  const { facts, weight, bodyFat } = buildSnapshot(user);
  const base = recommendGoals(facts, user.goalPace);

  const profile: ProfileValues = {
    displayName: user.displayName,
    sex: user.sex,
    birthDate: user.birthDate,
    heightCm: user.heightCm,
    timezone: user.timezone,
    activityLevel: user.activityLevel,
    estimateStyle: user.estimateStyle,
    goalPace: user.goalPace,
    calorieTarget: user.calorieTarget,
    proteinTargetG: user.proteinTargetG,
    targetWeightKg: user.targetWeightKg,
  };

  // 每一档节奏各算一遍，页面上可以直接比较
  const options: PaceOption[] = base
    ? GOAL_PACES.map((pace) => {
        const rec = recommendGoals(facts, pace)!;
        return { pace, label: PACES[pace].label, hint: PACES[pace].hint, calorieTarget: rec.calorieTarget, proteinTargetG: rec.proteinTargetG, limited: rec.limited };
      })
    : [];

  const basis = base
    ? [
        `体重 ${facts.weightKg} kg${weight.avg7Kg !== null ? "（近 7 日平均）" : weight.latestDate ? `（${shortDate(weight.latestDate)} 记录）` : ""}` +
          (bodyFat ? `，体脂率 ${bodyFat.value}%` : ""),
        `每天消耗约 ${base.tdee} kcal = 基础代谢 ${base.bmr}（${base.bmrSource}）× 活动系数 ${ACTIVITY[facts.activityLevel].factor}`,
        `蛋白质：${base.proteinBasis}`,
      ]
    : [];

  return (
    <div className="space-y-3 lg:space-y-4">
      <h1 className="page-title flex h-11 items-center justify-center">我的</h1>
      {base ? (
        <GoalRecommendation profile={profile} options={options} basis={basis} bmr={base.bmr} />
      ) : (
        <p className="card-tint text-sm">上传一次体脂秤报告，并填好性别、出生日期和身高后，这里可以选择节奏，系统会算出每天该吃多少。</p>
      )}
      <SettingsForm key={`form-${user.updatedAt}`} initial={profile} />
      <AccountActions username={user.username} />
    </div>
  );
}
