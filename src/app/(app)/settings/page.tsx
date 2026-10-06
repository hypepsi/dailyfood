import { AccountActions } from "@/components/AccountActions";
import { SettingsForm } from "@/components/SettingsForm";
import { requireUser } from "@/lib/session";
import { buildSnapshot } from "@/services/snapshot";

export default async function SettingsPage() {
  const user = await requireUser();
  const { bmr } = buildSnapshot(user);
  return (
    <div className="space-y-3">
      <h1 className="text-center text-xl font-bold">我的</h1>
      <SettingsForm
        key={user.updatedAt}
        bmrHint={bmr ? `基础代谢约 ${Math.round(bmr.value)} kcal（${bmr.source}），不建议低于它` : null}
        initial={{
          displayName: user.displayName,
          sex: user.sex,
          birthDate: user.birthDate,
          heightCm: user.heightCm,
          timezone: user.timezone,
          calorieTarget: user.calorieTarget,
          proteinTargetG: user.proteinTargetG,
          targetWeightKg: user.targetWeightKg,
        }}
      />
      <AccountActions username={user.username} />
    </div>
  );
}
