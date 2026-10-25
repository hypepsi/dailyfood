import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { callModel } from "./client";
import { GLUCOSE_REVIEW } from "./prompts";

export const GLUCOSE_LEVELS = ["steady", "moderate", "spiky"] as const;
export type GlucoseLevel = (typeof GLUCOSE_LEVELS)[number];

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["level", "summary", "meals", "tips"],
  properties: {
    level: { type: "string", enum: GLUCOSE_LEVELS },
    summary: { type: "string" },
    meals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["meal", "level", "note"],
        properties: { meal: { type: "string" }, level: { type: "string", enum: GLUCOSE_LEVELS }, note: { type: "string" } },
      },
    },
    tips: { type: "array", items: { type: "string" } },
  },
};

const modelOutput = z.object({
  level: z.enum(GLUCOSE_LEVELS),
  summary: z.string(),
  meals: z.array(z.object({ meal: z.string(), level: z.enum(GLUCOSE_LEVELS), note: z.string() })),
  tips: z.array(z.string()),
});

export type GlucoseReview = z.infer<typeof modelOutput>;

/** 校验模型输出：总结和至少一条建议必须有，长度截断，防止撑破卡片 */
export function normalizeGlucose(raw: unknown): GlucoseReview {
  const p = modelOutput.parse(raw);
  const summary = p.summary.trim().slice(0, 160);
  const tips = p.tips.map((t) => t.trim()).filter(Boolean).slice(0, 2).map((t) => t.slice(0, 80));
  const meals = p.meals
    .filter((m) => m.meal.trim())
    .slice(0, 8)
    .map((m) => ({ meal: m.meal.trim().slice(0, 6), level: m.level, note: m.note.trim().slice(0, 60) }));
  if (!summary || tips.length === 0) throw new Error("glucose review is missing summary or tips");
  return { level: p.level, summary, meals, tips };
}

export async function writeGlucoseReview(user: User, data: string): Promise<GlucoseReview> {
  const output = await callModel({
    user,
    kind: "glucose",
    instructions: `${GLUCOSE_REVIEW}\n\n【今天的饮食】\n${data}`,
    input: [{ role: "user", content: "盘点一下我今天吃的对血糖的影响。" }],
    jsonSchema: { name: "glucose_review", schema: JSON_SCHEMA },
    maxOutputTokens: 1500,
  });
  try {
    return normalizeGlucose(JSON.parse(output));
  } catch (err) {
    log.error("glucose review did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的盘点不完整，请稍后再试");
  }
}
