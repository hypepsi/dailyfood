import { z } from "zod";
import { MEAL_TYPES, type MealType, type User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { round1 } from "@/lib/nutrition";
import type { ItemInput } from "@/services/meals";
import { callModel, type AiContent } from "./client";
import { MEAL_ANALYSIS } from "./prompts";

const CONFIDENCE = ["high", "medium", "low"] as const;

/** 发给模型的 JSON Schema（strict 模式：所有字段必填、禁止多余字段） */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "title", "items", "kcal_low", "kcal_high", "people_hint", "people_stated", "meal_type_stated", "questions", "note"],
  properties: {
    is_food: { type: "boolean", description: "内容里是否有可以估算的食物或饮料" },
    title: { type: "string", description: "这顿饭的简短名称，不超过 12 个字" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "weight_g", "kcal", "protein_g", "carbs_g", "fat_g", "personal", "confidence"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string", description: "人能看懂的数量，如“2 个”“1 碗”“约半份”" },
          weight_g: { type: ["number", "null"], description: "可食部分克数；饮料用毫升数" },
          kcal: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          personal: { type: "boolean", description: "这一项是否明确只是用户一个人的份（如“我吃了一碗米饭”）；合吃的菜或无法判断填 false" },
          confidence: { type: "string", enum: CONFIDENCE },
        },
      },
    },
    kcal_low: { type: "number", description: "整顿饭总热量合理范围下限" },
    kcal_high: { type: "number", description: "整顿饭总热量合理范围上限" },
    people_hint: { type: "integer", description: "这些食物大约是几个人的量；一人份填 1" },
    people_stated: { type: ["integer", "null"], description: "用户明确说出的一起吃饭总人数（含本人）；没说为 null" },
    meal_type_stated: { type: ["string", "null"], enum: ["breakfast", "lunch", "dinner", "snack", null], description: "用户明确说出的餐次；没说为 null" },
    questions: {
      type: "array",
      description: "最多 2 个；没有显著影响就留空",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
        },
      },
    },
    note: { type: "string", description: "一句话说明主要的不确定因素；没有就留空" },
  },
};

const modelOutput = z.object({
  is_food: z.boolean(),
  title: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      weight_g: z.number().nullable(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      personal: z.boolean(),
      confidence: z.enum(CONFIDENCE),
    }),
  ),
  kcal_low: z.number(),
  kcal_high: z.number(),
  people_hint: z.number(),
  people_stated: z.number().nullable(),
  meal_type_stated: z.enum(MEAL_TYPES).nullable(),
  questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })),
  note: z.string(),
});

export type MealEstimate = {
  title: string;
  items: (ItemInput & { confidence: (typeof CONFIDENCE)[number] })[];
  totalKcal: number;
  kcalLow: number;
  kcalHigh: number;
  /** AI 觉得这像几个人的量；只用于界面提示，不自动分摊 */
  peopleHint: number;
  /** 用户在描述里明确说出的人数和餐次，用作确认页的默认值 */
  peopleStated: number | null;
  mealTypeStated: MealType | null;
  questions: { question: string; options: string[] }[];
  note: string;
};

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

/**
 * 蛋白质×4 + 碳水×4 + 脂肪×9 应大致等于热量。
 * 相差超过 35%（且不是很小的数）说明这一项估算自相矛盾，标成“不太确定”提醒用户核对。
 */
function macrosMatchKcal(i: { kcal: number; proteinG: number; carbsG: number; fatG: number }): boolean {
  const fromMacros = i.proteinG * 4 + i.carbsG * 4 + i.fatG * 9;
  const diff = Math.abs(fromMacros - i.kcal);
  return diff <= 40 || diff <= Math.max(i.kcal, fromMacros) * 0.35;
}

/** 校验并规范化模型输出。总热量由程序按各项相加，不采用模型自己算的总数 */
export function normalizeEstimate(raw: unknown): MealEstimate {
  const parsed = modelOutput.parse(raw);
  const items = parsed.items
    .filter((i) => i.name.trim())
    .slice(0, 30)
    .map((i) => ({
      name: i.name.trim().slice(0, 60),
      quantity: i.quantity.trim().slice(0, 30),
      weightG: i.weight_g === null ? null : Math.round(clamp(i.weight_g, 5000)),
      kcal: Math.round(clamp(i.kcal, 10000)),
      proteinG: round1(clamp(i.protein_g, 1000)),
      carbsG: round1(clamp(i.carbs_g, 1000)),
      fatG: round1(clamp(i.fat_g, 1000)),
      personal: i.personal,
      eatenFraction: 1,
      confidence: i.confidence,
    }))
    .map((i) => (macrosMatchKcal(i) ? i : { ...i, confidence: "low" as const }));
  if (!parsed.is_food || items.length === 0) {
    throw new AppError(422, "no_food", "没有识别出食物，请重新拍一张，或改用手动记录");
  }
  const totalKcal = items.reduce((s, i) => s + i.kcal, 0);
  let kcalLow = Math.round(parsed.kcal_low);
  let kcalHigh = Math.round(parsed.kcal_high);
  // 模型给的范围必须包住程序算出的总数，否则退回到 ±15%
  if (!(kcalLow > 0 && kcalLow <= totalKcal && totalKcal <= kcalHigh)) {
    kcalLow = Math.round(totalKcal * 0.85);
    kcalHigh = Math.round(totalKcal * 1.15);
  }
  return {
    title: parsed.title.trim().slice(0, 60),
    items,
    totalKcal,
    kcalLow,
    kcalHigh,
    peopleHint: Math.min(Math.max(Math.round(parsed.people_hint), 1), 12),
    peopleStated: parsed.people_stated === null ? null : Math.min(Math.max(Math.round(parsed.people_stated), 1), 20),
    mealTypeStated: parsed.meal_type_stated,
    questions: parsed.questions
      .filter((q) => q.question.trim() && q.options.length >= 2)
      .slice(0, 2)
      .map((q) => ({ question: q.question.trim().slice(0, 80), options: q.options.slice(0, 4).map((o) => o.slice(0, 20)) })),
    note: parsed.note.trim().slice(0, 200),
  };
}

export type AnalyzeInput = {
  /** 同一顿饭的一张或多张照片（WebP） */
  images?: Buffer[];
  /** 用户的文字描述或补充说明 */
  text?: string;
  /** 对上一轮追问的回答 */
  answers?: { question: string; answer: string }[];
};

export async function analyzeMeal(user: User, input: AnalyzeInput): Promise<MealEstimate> {
  const content: AiContent[] = [];
  const images = input.images ?? [];
  for (const image of images) {
    content.push({ type: "input_image", image_url: `data:image/webp;base64,${image.toString("base64")}`, detail: "high" });
  }
  const textParts: string[] = [];
  if (images.length === 1) textParts.push("请估算照片里这顿饭。");
  if (images.length > 1) textParts.push(`这 ${images.length} 张照片拍的是同一顿饭，请合在一起估算。`);
  if (input.text) textParts.push(`用户描述：${input.text}`);
  if (input.answers?.length) {
    textParts.push("用户对补充问题的回答：");
    for (const a of input.answers) textParts.push(`- ${a.question} → ${a.answer}`);
  }
  content.push({ type: "input_text", text: textParts.join("\n") });

  const output = await callModel({
    user,
    kind: "analyze",
    instructions: MEAL_ANALYSIS,
    input: [{ role: "user", content }],
    jsonSchema: { name: "meal_estimate", schema: JSON_SCHEMA },
    maxOutputTokens: 3000,
  });
  try {
    return normalizeEstimate(JSON.parse(output));
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("meal estimate did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的结果无法使用，请重试或手动记录");
  }
}
