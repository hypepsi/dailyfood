import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { callModel } from "./client";
import { WEEKLY_REVIEW } from "./prompts";

/** 复盘固定判断的八个维度，顺序即展示顺序 */
export const DIMENSIONS = {
  calories: "吃得多不多",
  protein: "蛋白质够不够",
  deficit: "热量差稳不稳",
  food_quality: "吃得好不好",
  rhythm: "三餐规律吗",
  weight: "体重怎么样",
  activity: "运动了多少",
  logging: "记得全不全",
} as const;
export type DimensionKey = keyof typeof DIMENSIONS;
const KEYS = Object.keys(DIMENSIONS) as DimensionKey[];

const VERDICTS = ["good", "ok", "attention"] as const;
export type Verdict = (typeof VERDICTS)[number];

const stringList = { type: "array", items: { type: "string" } };

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "dimensions", "wins", "issues", "next_week"],
  properties: {
    headline: { type: "string", description: "一句话概括这一周" },
    dimensions: {
      type: "array",
      description: "八个维度各一项",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "verdict", "summary", "evidence"],
        properties: {
          key: { type: "string", enum: KEYS },
          verdict: { type: "string", enum: VERDICTS },
          summary: { type: "string" },
          evidence: { type: "string", description: "支撑结论的具体数字和日期" },
        },
      },
    },
    wins: stringList,
    issues: stringList,
    next_week: stringList,
  },
};

const modelOutput = z.object({
  headline: z.string(),
  dimensions: z.array(z.object({ key: z.enum(KEYS), verdict: z.enum(VERDICTS), summary: z.string(), evidence: z.string() })),
  wins: z.array(z.string()),
  issues: z.array(z.string()),
  next_week: z.array(z.string()),
});

export type Review = {
  headline: string;
  dimensions: { key: DimensionKey; verdict: Verdict; summary: string; evidence: string }[];
  wins: string[];
  issues: string[];
  nextWeek: string[];
};

const clean = (list: string[], max: number, length: number) =>
  list
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((s) => s.slice(0, length));

/** 校验模型输出：八个维度必须齐全、不重复，并按固定顺序排列 */
export function normalizeReview(raw: unknown): Review {
  const parsed = modelOutput.parse(raw);
  const byKey = new Map(parsed.dimensions.map((d) => [d.key, d]));
  const missing = KEYS.filter((k) => !byKey.get(k)?.summary.trim());
  if (missing.length) throw new Error(`review is missing dimensions: ${missing.join(", ")}`);
  const nextWeek = clean(parsed.next_week, 3, 120);
  if (!parsed.headline.trim() || nextWeek.length === 0) throw new Error("review is missing headline or actions");
  return {
    headline: parsed.headline.trim().slice(0, 120),
    dimensions: KEYS.map((key) => {
      const d = byKey.get(key)!;
      return { key, verdict: d.verdict, summary: d.summary.trim().slice(0, 160), evidence: d.evidence.trim().slice(0, 200) };
    }),
    wins: clean(parsed.wins, 3, 120),
    issues: clean(parsed.issues, 3, 120),
    nextWeek,
  };
}

/** 生成 7 天复盘。这是全站唯一需要模型“多想一会儿”的任务，所以放宽思考深度和超时 */
export async function writeReview(user: User, data: string): Promise<Review> {
  const output = await callModel({
    user,
    kind: "review",
    instructions: `${WEEKLY_REVIEW}\n\n【系统数据】\n${data}`,
    input: [{ role: "user", content: "请做这 7 天的复盘。" }],
    jsonSchema: { name: "weekly_review", schema: JSON_SCHEMA },
    effort: "medium",
    maxOutputTokens: 6000,
    timeoutMs: 90_000,
  });
  try {
    return normalizeReview(JSON.parse(output));
  } catch (err) {
    log.error("weekly review did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的复盘不完整，请再试一次");
  }
}
