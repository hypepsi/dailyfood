import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { callModel } from "./client";
import { MEAL_ADJUSTMENT } from "./prompts";

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["understood", "all_fraction", "adjustments", "summary"],
  properties: {
    understood: { type: "boolean" },
    all_fraction: { type: ["number", "null"], description: "用户说的是整顿饭时的比例；否则为 null" },
    adjustments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "eaten_fraction"],
        properties: {
          index: { type: "integer", description: "食物清单里的编号" },
          eaten_fraction: { type: "number" },
        },
      },
    },
    summary: { type: "string" },
  },
};

const modelOutput = z.object({
  understood: z.boolean(),
  all_fraction: z.number().nullable(),
  adjustments: z.array(z.object({ index: z.number(), eaten_fraction: z.number() })),
  summary: z.string(),
});

export type MealAdjustment = {
  /** 每样食物的新比例；null 表示用户没提到，保持原样 */
  fractions: (number | null)[];
  summary: string;
};

const clampFraction = (n: number) => Math.round(Math.min(Math.max(n, 0), 3) * 100) / 100;

/** 校验模型输出并展开成“每样食物一个比例”。只接受清单里存在的编号 */
export function normalizeAdjustment(raw: unknown, itemCount: number): MealAdjustment {
  const parsed = modelOutput.parse(raw);
  const fractions: (number | null)[] = Array.from({ length: itemCount }, () => null);
  if (parsed.all_fraction !== null) fractions.fill(clampFraction(parsed.all_fraction));
  for (const a of parsed.adjustments) {
    const index = Math.round(a.index) - 1;
    if (index >= 0 && index < itemCount) fractions[index] = clampFraction(a.eaten_fraction);
  }
  if (!parsed.understood || fractions.every((f) => f === null)) {
    throw new AppError(422, "not_understood", "没听出要怎么修正，可以说「米饭剩了一半」或「整体只吃了一半」");
  }
  return { fractions, summary: parsed.summary.trim().slice(0, 100) };
}

/** 把“米饭没吃完”这样的话翻译成每样食物实际吃掉的比例。热量由程序按比例计算 */
export async function interpretAdjustment(user: User, items: { name: string; quantity: string }[], statement: string): Promise<MealAdjustment> {
  const list = items.map((item, i) => `${i + 1}. ${item.name}${item.quantity ? `（${item.quantity}）` : ""}`).join("\n");
  const output = await callModel({
    user,
    kind: "adjust",
    instructions: MEAL_ADJUSTMENT,
    input: [{ role: "user", content: `食物清单：\n${list}\n\n用户的说明：${statement}` }],
    jsonSchema: { name: "meal_adjustment", schema: JSON_SCHEMA },
    maxOutputTokens: 800,
  });
  try {
    return normalizeAdjustment(JSON.parse(output), items.length);
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("meal adjustment did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的结果无法使用，请重试或直接点选比例");
  }
}
