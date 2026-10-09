import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { round1 } from "@/lib/nutrition";
import { callModel, type AiContent } from "./client";
import { MEAL_EDIT, withEstimateStyle } from "./prompts";

const ACTIONS = ["update", "add", "remove", "portion"] as const;

const ITEM_SCHEMA = {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["name", "quantity", "weight_g", "kcal", "protein_g", "carbs_g", "fat_g"],
  properties: {
    name: { type: "string" },
    quantity: { type: "string" },
    weight_g: { type: ["number", "null"] },
    kcal: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
};

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["understood", "summary", "title", "people", "operations"],
  properties: {
    understood: { type: "boolean" },
    summary: { type: "string" },
    title: { type: ["string", "null"], description: "食物种类变了时的新名称；否则 null" },
    people: { type: ["integer", "null"], description: "用户明确说出的一起吃饭总人数；否则 null" },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "index", "eaten_fraction", "item"],
        properties: {
          action: { type: "string", enum: ACTIONS },
          index: { type: ["integer", "null"], description: "清单里的编号；add 时为 null" },
          eaten_fraction: { type: ["number", "null"], description: "portion 时填写" },
          item: { ...ITEM_SCHEMA, description: "update 和 add 时给出完整的重新估算结果" },
        },
      },
    },
  },
};

const itemOutput = z.object({
  name: z.string(),
  quantity: z.string(),
  weight_g: z.number().nullable(),
  kcal: z.number(),
  protein_g: z.number(),
  carbs_g: z.number(),
  fat_g: z.number(),
});

const modelOutput = z.object({
  understood: z.boolean(),
  summary: z.string(),
  title: z.string().nullable(),
  people: z.number().nullable(),
  operations: z.array(z.object({ action: z.enum(ACTIONS), index: z.number().nullable(), eaten_fraction: z.number().nullable(), item: itemOutput.nullable() })),
});

export type EditedItem = { name: string; quantity: string; weightG: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number };

/** 一次修改的结果，下标都对应调用方传入的清单（从 0 开始） */
export type MealEdit = {
  /** 被替换的项目：认错了、做法或份量不对，已按改正后的食物重新估算 */
  updates: { index: number; item: EditedItem }[];
  /** 新加的项目 */
  adds: EditedItem[];
  /** 要删掉的项目 */
  removes: number[];
  /** 只是没吃完：实际吃掉的比例 */
  portions: { index: number; fraction: number }[];
  title: string | null;
  people: number | null;
  summary: string;
};

const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max);

function cleanItem(raw: z.infer<typeof itemOutput>): EditedItem | null {
  const name = raw.name.trim().slice(0, 60);
  if (!name) return null;
  return {
    name,
    quantity: raw.quantity.trim().slice(0, 30),
    weightG: raw.weight_g === null ? null : Math.round(clamp(raw.weight_g, 5000)),
    kcal: Math.round(clamp(raw.kcal, 10000)),
    proteinG: round1(clamp(raw.protein_g, 1000)),
    carbsG: round1(clamp(raw.carbs_g, 1000)),
    fatG: round1(clamp(raw.fat_g, 1000)),
  };
}

/**
 * 校验模型输出：只接受清单里存在的编号；同一项不会既被删除又被修改；
 * 什么都没改或没听懂时报错，不动任何数据。
 */
export function normalizeEdit(raw: unknown, itemCount: number, focus?: number): MealEdit {
  const parsed = modelOutput.parse(raw);
  const edit: MealEdit = { updates: [], adds: [], removes: [], portions: [], title: null, people: null, summary: parsed.summary.trim().slice(0, 120) };
  const valid = (i: number | null): i is number => i !== null && Number.isInteger(i) && i >= 1 && i <= itemCount;

  for (const op of parsed.operations) {
    const item = op.item ? cleanItem(op.item) : null;
    if (op.action === "add" && item) edit.adds.push(item);
    else if (!valid(op.index)) continue;
    else if (op.action === "remove") edit.removes.push(op.index - 1);
    else if (op.action === "update" && item) edit.updates.push({ index: op.index - 1, item });
    else if (op.action === "portion" && op.eaten_fraction !== null) edit.portions.push({ index: op.index - 1, fraction: Math.round(clamp(op.eaten_fraction, 3) * 100) / 100 });
  }
  // 用户是点着某一样说的：只接受针对这一样的修改（补充新食物仍然允许），别的项目即使模型想动也不动
  if (focus !== undefined) {
    edit.removes = edit.removes.filter((i) => i === focus);
    edit.updates = edit.updates.filter((u) => u.index === focus);
    edit.portions = edit.portions.filter((p) => p.index === focus);
  }
  // 删除优先：已经删掉的项目不再修改
  const removed = new Set(edit.removes);
  edit.removes = [...removed];
  edit.updates = edit.updates.filter((u) => !removed.has(u.index));
  edit.portions = edit.portions.filter((p) => !removed.has(p.index));
  if (removed.size >= itemCount && edit.adds.length === 0) throw new AppError(422, "not_understood", "不能把所有食物都删掉；想放弃这顿饭请用页面底部的删除");

  const changed = edit.updates.length + edit.adds.length + edit.removes.length + edit.portions.length;
  if (parsed.people !== null && parsed.people >= 1) edit.people = Math.min(Math.round(parsed.people), 20);
  if (!parsed.understood || (changed === 0 && edit.people === null)) throw new AppError(422, "not_understood", "没听出要怎么改");
  // 只有食物种类变了才换名称
  if (parsed.title?.trim() && (edit.updates.length || edit.adds.length || edit.removes.length)) edit.title = parsed.title.trim().slice(0, 60);
  return edit;
}

export type CurrentItem = { name: string; quantity: string; weightG: number | null; kcal: number; proteinG: number; carbsG: number; fatG: number };

/**
 * 把“面条是乌冬面”“米饭剩了一半”这样的话，变成对食物清单的精确修改。
 * 只改用户提到的项目；被改的项目由模型重新估算，其余数值原样保留。
 */
export async function editMeal(user: User, items: CurrentItem[], statement: string, options: { images?: Buffer[]; focus?: number } = {}): Promise<MealEdit> {
  const { images = [], focus } = options;
  const said = focus === undefined ? `用户说：${statement}` : `用户正在修改第 ${focus + 1} 项「${items[focus].name}」，下面这句话说的就是这一项。\n用户说：${statement}`;
  const list = items
    .map((i, n) => `${n + 1}. ${i.name}｜${i.quantity || "数量未填"}｜${i.weightG ?? "?"} g｜${Math.round(i.kcal)} kcal｜蛋白质 ${i.proteinG} g，碳水 ${i.carbsG} g，脂肪 ${i.fatG} g`)
    .join("\n");
  const output = await callModel({
    user,
    kind: "edit",
    instructions: withEstimateStyle(MEAL_EDIT, user.estimateStyle),
    input: [
      {
        role: "user",
        content: [
          ...images.map((image): AiContent => ({ type: "input_image", image_url: `data:image/webp;base64,${image.toString("base64")}`, detail: "high" })),
          { type: "input_text", text: `当前的食物清单：\n${list}\n\n${said}` },
        ],
      },
    ],
    jsonSchema: { name: "meal_edit", schema: JSON_SCHEMA },
    maxOutputTokens: 2000,
  });
  try {
    return normalizeEdit(JSON.parse(output), items.length, focus);
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("meal edit did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的结果无法使用，请重试或直接手动修改");
  }
}
