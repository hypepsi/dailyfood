/** 体脂秤报告里除核心指标外的其他数值：键名、中文名和单位（前后端共用） */
export const EXTRA_METRICS = {
  fatMassKg: { label: "脂肪量", unit: "kg" },
  leanMassKg: { label: "去脂体重", unit: "kg" },
  proteinKg: { label: "蛋白质量", unit: "kg" },
  waterKg: { label: "体水分量", unit: "kg" },
  boneMineralKg: { label: "骨盐量", unit: "kg" },
  bmi: { label: "BMI", unit: "" },
  bodyAge: { label: "身体年龄", unit: "岁" },
  waistHipRatio: { label: "腰臀比", unit: "" },
  score: { label: "身体得分", unit: "分" },
} as const;

export type ExtraKey = keyof typeof EXTRA_METRICS;
export type ExtraMetrics = Partial<Record<ExtraKey, number>>;

export const CORE_METRICS = {
  weightKg: { label: "体重", unit: "kg" },
  bodyFatPct: { label: "体脂率", unit: "%" },
  waistCm: { label: "腰围", unit: "cm" },
  muscleKg: { label: "肌肉量", unit: "kg" },
  skeletalMuscleKg: { label: "骨骼肌量", unit: "kg" },
  visceralFat: { label: "内脏脂肪等级", unit: "" },
  bmrKcal: { label: "基础代谢", unit: "kcal" },
} as const;

export function parseExtra(json: string | null): ExtraMetrics {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const out: ExtraMetrics = {};
    for (const key of Object.keys(EXTRA_METRICS) as ExtraKey[]) {
      if (typeof raw[key] === "number") out[key] = raw[key];
    }
    return out;
  } catch {
    return {};
  }
}
