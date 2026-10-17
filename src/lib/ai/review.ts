import { z } from "zod";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/logger";
import { callModel } from "./client";
import { WEEKLY_REVIEW } from "./prompts";

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "next_steps"],
  properties: {
    headline: { type: "string", description: "一句话说这一周" },
    summary: { type: "string", description: "3~5 句话：吃得怎么样、进展怎么样、最明显的一件事" },
    next_steps: { type: "array", items: { type: "string" }, description: "1~2 条下周最值得做的事" },
  },
};

const modelOutput = z.object({ headline: z.string(), summary: z.string(), next_steps: z.array(z.string()) });

export type Review = {
  headline: string;
  summary: string;
  nextSteps: string[];
};

/** 校验模型输出：总结和至少一条下一步必须有 */
export function normalizeReview(raw: unknown): Review {
  const parsed = modelOutput.parse(raw);
  const headline = parsed.headline.trim().slice(0, 120);
  const summary = parsed.summary.trim().slice(0, 400);
  const nextSteps = parsed.next_steps.map((s) => s.trim()).filter(Boolean).slice(0, 2).map((s) => s.slice(0, 120));
  if (!headline || !summary || nextSteps.length === 0) throw new Error("review is missing headline, summary or next steps");
  return { headline, summary, nextSteps };
}

/**
 * 读取已保存的分析。以前的版本是“八个方面 + 三件事”的结构，这里换算成现在的样子，
 * 旧的分析在“以前的分析”里也能正常显示。
 */
export function fromStored(content: string): Review {
  const raw = JSON.parse(content) as Partial<Review> & { wins?: string[]; issues?: string[]; nextWeek?: string[] };
  if (typeof raw.summary === "string" && Array.isArray(raw.nextSteps)) return raw as Review;
  return {
    headline: raw.headline ?? "",
    summary: [...(raw.wins ?? []), ...(raw.issues ?? [])].join(""),
    nextSteps: (raw.nextWeek ?? []).slice(0, 2),
  };
}

/** 生成 7 天总结。在后台跑，所以可以多想一会儿 */
export async function writeReview(user: User, data: string): Promise<Review> {
  const output = await callModel({
    user,
    kind: "review",
    instructions: `${WEEKLY_REVIEW}\n\n【系统数据】\n${data}`,
    input: [{ role: "user", content: "请总结这 7 天。" }],
    jsonSchema: { name: "weekly_review", schema: JSON_SCHEMA },
    effort: "medium",
    maxOutputTokens: 3000,
    // 在后台跑，不受反向代理 100 秒的限制
    timeoutMs: 180_000,
  });
  try {
    return normalizeReview(JSON.parse(output));
  } catch (err) {
    log.error("weekly review did not match schema", err);
    throw new AppError(502, "ai_failed", "AI 返回的总结不完整，请再试一次");
  }
}
