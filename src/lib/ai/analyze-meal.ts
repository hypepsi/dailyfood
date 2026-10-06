import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { round1 } from "@/lib/nutrition";
import type { ItemInput } from "@/services/meals";
import { callModel, type AiContent } from "./client";

const CONFIDENCE = ["high", "medium", "low"] as const;

/** 发给模型的 JSON Schema（strict 模式：所有字段必填、禁止多余字段） */
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "title", "items", "kcal_low", "kcal_high", "questions", "note"],
  properties: {
    is_food: { type: "boolean", description: "内容里是否有可以估算的食物或饮料" },
    title: { type: "string", description: "这顿饭的简短名称，不超过 12 个字" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "weight_g", "kcal", "protein_g", "carbs_g", "fat_g", "confidence"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string", description: "人能看懂的数量，如“2 个”“1 碗”“约半份”" },
          weight_g: { type: ["number", "null"], description: "可食部分克数；饮料用毫升数" },
          kcal: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          confidence: { type: "string", enum: CONFIDENCE },
        },
      },
    },
    kcal_low: { type: "number", description: "整顿饭总热量合理范围下限" },
    kcal_high: { type: "number", description: "整顿饭总热量合理范围上限" },
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
      confidence: z.enum(CONFIDENCE),
    }),
  ),
  kcal_low: z.number(),
  kcal_high: z.number(),
  questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })),
  note: z.string(),
});

export type MealEstimate = {
  title: string;
  items: (ItemInput & { confidence: (typeof CONFIDENCE)[number] })[];
  totalKcal: number;
  kcalLow: number;
  kcalHigh: number;
  questions: { question: string; options: string[] }[];
  note: string;
};

const INSTRUCTIONS = `你是一个严谨的食物营养估算助手，服务于中国用户的减脂饮食记录。

任务：根据照片或文字描述，识别这顿饭里的每一种食物和饮料，估算份量和营养。

规则：
- 每种食物单独一项，不要合并成一个总数。例如“玉米、鸡蛋两个、无花果两个、豆浆”应该是 4 项。
- 同一种食物有多个时合成一项，在 quantity 里写数量（如“2 个”）。
- weight_g 是可食部分的重量，kcal 和三大营养素对应这一项的全部份量，不是每 100 克。
- 按中国常见做法和常见份量估算。炒菜、油炸、红烧类要把烹调用油算进去。
- 不要假装精确。kcal_low 和 kcal_high 给出整顿饭总热量的合理范围：看得清、份量明确时范围窄一些，油量、份量看不清时范围要宽。
- confidence 表示对这一项的把握：high=种类和份量都清楚；medium=种类清楚但份量靠估；low=种类或做法不确定。
- 只有当某个信息无法从内容判断、并且会让总热量相差约 15% 以上时才提问（例如油量、是否含糖、饮料容量、肉的部位、主食份量）。最多 2 个问题，每个问题给 2~4 个简短选项。不重要就不要问。
- 如果用户已经回答过补充问题，按回答修正估算，不要再重复提问。
- 照片里的餐具、调料瓶、未入口的装饰物不算食物。如果完全没有食物，is_food 返回 false，items 返回空数组。
- 所有文字用简体中文。`;

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

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
      confidence: i.confidence,
    }));
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
    questions: parsed.questions
      .filter((q) => q.question.trim() && q.options.length >= 2)
      .slice(0, 2)
      .map((q) => ({ question: q.question.trim().slice(0, 80), options: q.options.slice(0, 4).map((o) => o.slice(0, 20)) })),
    note: parsed.note.trim().slice(0, 200),
  };
}

export type AnalyzeInput = {
  /** WebP 图片 */
  image?: Buffer;
  /** 用户的文字描述或补充说明 */
  text?: string;
  /** 对上一轮追问的回答 */
  answers?: { question: string; answer: string }[];
};

export async function analyzeMeal(user: User, input: AnalyzeInput): Promise<MealEstimate> {
  const content: AiContent[] = [];
  if (input.image) {
    content.push({
      type: "input_image",
      image_url: `data:image/webp;base64,${input.image.toString("base64")}`,
      detail: "high",
    });
  }
  const textParts: string[] = [];
  if (input.image) textParts.push("请估算照片里这顿饭。");
  if (input.text) textParts.push(`用户描述：${input.text}`);
  if (input.answers?.length) {
    textParts.push("用户对补充问题的回答：");
    for (const a of input.answers) textParts.push(`- ${a.question} → ${a.answer}`);
  }
  content.push({ type: "input_text", text: textParts.join("\n") });

  const output = await callModel({
    user,
    kind: "analyze",
    instructions: INSTRUCTIONS,
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
