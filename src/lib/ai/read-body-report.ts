import { z } from "zod";
import type { User } from "@/db/schema";
import { EXTRA_METRICS, type ExtraKey, type ExtraMetrics } from "@/lib/body-report";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { isDateString } from "@/lib/time";
import { callModel } from "./client";
import { BODY_REPORT_READING } from "./prompts";

/** 模型输出字段 → 合理范围。超出范围的值视为读错，丢弃 */
const FIELDS = {
  weight_kg: [20, 400],
  body_fat_pct: [2, 75],
  waist_cm: [30, 250],
  muscle_kg: [5, 200],
  skeletal_muscle_kg: [5, 150],
  visceral_fat: [1, 60],
  bmr_kcal: [500, 6000],
  fat_mass_kg: [1, 300],
  lean_mass_kg: [10, 300],
  protein_kg: [1, 80],
  water_kg: [5, 200],
  bone_mineral_kg: [0.5, 15],
  bmi: [8, 90],
  body_age: [5, 120],
  waist_hip_ratio: [0.4, 2],
  score: [0, 100],
} as const;

type Field = keyof typeof FIELDS;
const FIELD_NAMES = Object.keys(FIELDS) as Field[];

const DESCRIPTIONS: Record<Field, string> = {
  weight_kg: "体重 kg",
  body_fat_pct: "体脂率 %",
  waist_cm: "腰围 cm（不是腰臀比）",
  muscle_kg: "肌肉量 kg",
  skeletal_muscle_kg: "骨骼肌量 kg",
  visceral_fat: "内脏脂肪等级",
  bmr_kcal: "基础代谢率 kcal",
  fat_mass_kg: "脂肪量 kg",
  lean_mass_kg: "去脂体重 kg",
  protein_kg: "蛋白质量 kg",
  water_kg: "体水分量 kg",
  bone_mineral_kg: "骨盐量 kg",
  bmi: "BMI",
  body_age: "身体年龄",
  waist_hip_ratio: "腰臀比",
  score: "身体得分",
};

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_report", "measured_date", ...FIELD_NAMES],
  properties: {
    is_report: { type: "boolean", description: "图片是否是体脂秤/人体成分报告，或至少显示了体重读数" },
    measured_date: { type: ["string", "null"], description: "报告上的测量日期，格式 YYYY-MM-DD；没有就是 null" },
    ...Object.fromEntries(FIELD_NAMES.map((f) => [f, { type: ["number", "null"], description: DESCRIPTIONS[f] }])),
  },
};

const modelOutput = z.object({
  is_report: z.boolean(),
  measured_date: z.string().nullable(),
  ...(Object.fromEntries(FIELD_NAMES.map((f) => [f, z.number().nullable()])) as Record<Field, z.ZodNullable<z.ZodNumber>>),
});

export type BodyReport = {
  /** 报告上的测量日期；没有则为 null，由调用方决定用哪天 */
  date: string | null;
  core: {
    weightKg: number | null;
    bodyFatPct: number | null;
    waistCm: number | null;
    muscleKg: number | null;
    skeletalMuscleKg: number | null;
    visceralFat: number | null;
    bmrKcal: number | null;
  };
  extra: ExtraMetrics;
  /** 程序交叉核对发现的疑点，展示给用户 */
  warnings: string[];
};

const EXTRA_SOURCE: Record<ExtraKey, Field> = {
  fatMassKg: "fat_mass_kg",
  leanMassKg: "lean_mass_kg",
  proteinKg: "protein_kg",
  waterKg: "water_kg",
  boneMineralKg: "bone_mineral_kg",
  bmi: "bmi",
  bodyAge: "body_age",
  waistHipRatio: "waist_hip_ratio",
  score: "score",
};

/** 校验模型输出：范围检查 + 用报告内部的数值互相核对 */
export function normalizeBodyReport(raw: unknown): BodyReport {
  const parsed = modelOutput.parse(raw);
  const value = (f: Field): number | null => {
    const v = parsed[f];
    const [min, max] = FIELDS[f];
    return v !== null && v >= min && v <= max ? Math.round(v * 100) / 100 : null;
  };
  const core = {
    weightKg: value("weight_kg"),
    bodyFatPct: value("body_fat_pct"),
    waistCm: value("waist_cm"),
    muscleKg: value("muscle_kg"),
    skeletalMuscleKg: value("skeletal_muscle_kg"),
    visceralFat: value("visceral_fat"),
    bmrKcal: value("bmr_kcal"),
  };
  if (!parsed.is_report || core.weightKg === null) {
    throw new AppError(422, "not_report", "没有从图片里读到体重，请上传体脂秤报告的截图");
  }

  const extra: ExtraMetrics = {};
  for (const key of Object.keys(EXTRA_METRICS) as ExtraKey[]) {
    const v = value(EXTRA_SOURCE[key]);
    if (v !== null) extra[key] = v;
  }

  const warnings: string[] = [];
  // 体重 × 体脂率 应约等于脂肪量；体重 − 脂肪量 应约等于去脂体重
  if (core.bodyFatPct !== null && extra.fatMassKg !== undefined) {
    if (Math.abs((core.weightKg * core.bodyFatPct) / 100 - extra.fatMassKg) > 1) {
      warnings.push("体重、体脂率和脂肪量三个数对不上，请核对一下");
    }
  }
  if (extra.fatMassKg !== undefined && extra.leanMassKg !== undefined) {
    if (Math.abs(core.weightKg - extra.fatMassKg - extra.leanMassKg) > 1) {
      warnings.push("体重、脂肪量和去脂体重三个数对不上，请核对一下");
    }
  }
  if (core.muscleKg !== null && core.muscleKg >= core.weightKg) warnings.push("肌肉量不应大于体重，请核对一下");

  const date = parsed.measured_date && isDateString(parsed.measured_date) ? parsed.measured_date : null;
  return { date, core, extra, warnings };
}

export async function readBodyReport(user: User, image: Buffer): Promise<BodyReport> {
  const output = await callModel({
    user,
    kind: "report",
    instructions: BODY_REPORT_READING,
    input: [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: `data:image/webp;base64,${image.toString("base64")}`, detail: "high" },
          { type: "input_text", text: "请抄录这份报告里的数值。" },
        ],
      },
    ],
    jsonSchema: { name: "body_report", schema: JSON_SCHEMA },
    maxOutputTokens: 1500,
  });
  try {
    return normalizeBodyReport(JSON.parse(output));
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("body report did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的结果无法使用，请重试");
  }
}
