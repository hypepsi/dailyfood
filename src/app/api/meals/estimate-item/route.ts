import { z } from "zod";
import { analyzeMeal } from "@/lib/ai/analyze-meal";
import { api } from "@/lib/http";

export const maxDuration = 90;

const body = z.object({
  name: z.string().trim().min(1).max(60),
  quantity: z.string().trim().max(30).default(""),
  weightG: z.number().min(0).max(5000).nullable().default(null),
});

/**
 * 按名称重新估算一样食物：AI 认错了菜，或者用户手动加了一样食物时使用。
 * 只返回估算结果，不保存；由编辑页填回界面，用户确认后才生效。
 */
export const POST = api({ body }, async ({ user, body }) => {
  const portion = [body.quantity, body.weightG ? `约 ${body.weightG} 克` : ""].filter(Boolean).join("，");
  const estimate = await analyzeMeal(user, {
    text: `只有这一样食物，请只返回这一项：${body.name}${portion ? `（${portion}）` : ""}`,
  });
  // 模型偶尔会把一样食物拆成两项，这里合并成一项返回
  const sum = (pick: (i: (typeof estimate.items)[number]) => number) => Math.round(estimate.items.reduce((s, i) => s + pick(i), 0) * 10) / 10;
  const first = estimate.items[0];
  return {
    item: {
      quantity: body.quantity || first.quantity,
      weightG: body.weightG ?? (estimate.items.length === 1 ? first.weightG : null),
      kcal: Math.round(sum((i) => i.kcal)),
      proteinG: sum((i) => i.proteinG),
      carbsG: sum((i) => i.carbsG),
      fatG: sum((i) => i.fatG),
    },
  };
});
