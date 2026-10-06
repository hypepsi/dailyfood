import OpenAI from "openai";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.openaiKey) throw new AppError(503, "ai_unconfigured", "AI 服务尚未配置");
  client ??= new OpenAI({ apiKey: env.openaiKey, timeout: 60_000, maxRetries: 1 });
  return client;
}

export type AiContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "high" | "low" | "auto" };

export type AiMessage = { role: "user" | "assistant"; content: string | AiContent[] };

type CallOptions = {
  user: User;
  /** 用于用量统计和日志，如 analyze / chat / advice */
  kind: string;
  instructions: string;
  input: AiMessage[];
  maxOutputTokens?: number;
  /** 传入则要求模型严格按该 JSON Schema 输出 */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
};

function assertWithinDailyLimit(user: User) {
  const row = getDb()
    .select({ n: sql<number>`count(*)` })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, user.id), gte(schema.aiUsage.createdAt, Date.now() - 86400_000)))
    .get();
  if ((row?.n ?? 0) >= env.aiDailyLimit) {
    throw new AppError(429, "ai_limit", "今天的 AI 使用次数已达上限，明天再试或手动记录");
  }
}

/** 所有模型调用的唯一出口：限额、超时、用量记录、错误转换 */
export async function callModel(options: CallOptions): Promise<string> {
  assertWithinDailyLimit(options.user);
  const model = env.openaiModel;
  const started = Date.now();
  try {
    const response = await getClient().responses.create({
      model,
      store: false,
      reasoning: { effort: "low" },
      instructions: options.instructions,
      input: options.input as OpenAI.Responses.ResponseInput,
      max_output_tokens: options.maxOutputTokens ?? 2000,
      ...(options.jsonSchema
        ? { text: { format: { type: "json_schema", strict: true, ...options.jsonSchema } } }
        : {}),
    });
    const durationMs = Date.now() - started;
    getDb()
      .insert(schema.aiUsage)
      .values({
        userId: options.user.id,
        kind: options.kind,
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        durationMs,
        createdAt: Date.now(),
      })
      .run();
    log.info("ai call", { kind: options.kind, model, ms: durationMs, tokens: response.usage?.total_tokens });
    const text = response.output_text;
    if (!text) throw new Error(`empty model output (status=${response.status})`);
    return text;
  } catch (err) {
    if (err instanceof AppError) throw err;
    // 只记录在服务端日志里，前端只看到通用提示
    log.error("ai call failed", err, { kind: options.kind, model, ms: Date.now() - started });
    throw new AppError(502, "ai_failed", "AI 暂时没有响应，请稍后重试或手动记录");
  }
}

export const currentModel = () => env.openaiModel;
