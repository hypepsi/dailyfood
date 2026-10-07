import { z } from "zod";
import { analyzeMeal } from "@/lib/ai/analyze-meal";
import { MEAL_PROMPT_VERSION } from "@/lib/ai/prompts";
import { AppError } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { storage } from "@/lib/storage";
import { getMealImages, getMealRow, replaceDraftEstimate } from "@/services/meals";

export const maxDuration = 90;

const body = z.object({
  answers: z
    .array(z.object({ question: z.string().trim().min(1).max(100), answer: z.string().trim().min(1).max(100) }))
    .min(1)
    .max(4),
});

/** 用户回答了追问后，带着回答重新估算草稿 */
export const POST = api({ body }, async ({ user, body, params }) => {
  const id = idParam(params.id);
  const meal = getMealRow(user, id);
  if (meal.status !== "draft") throw new AppError(409, "not_draft", "这顿饭已经确认，无法重新识别");

  const previous = JSON.parse(meal.aiEstimate ?? "{}") as { text?: string | null };
  // 追问时把这顿饭的所有照片都再给模型看一遍
  const stored = await Promise.all(getMealImages(id).map((i) => (i.imagePath ? storage.read(i.imagePath) : null)));
  const images = stored.filter((b): b is Buffer => b !== null);
  const estimate = await analyzeMeal(user, {
    images,
    text: previous.text ?? undefined,
    answers: body.answers,
  });
  // 回答过就不再追问
  estimate.questions = [];
  replaceDraftEstimate(user, id, {
    title: estimate.title,
    items: estimate.items.map(({ confidence: _c, ...item }) => item),
    aiEstimate: { text: previous.text ?? null, answers: body.answers, promptVersion: MEAL_PROMPT_VERSION, estimate },
  });
});
