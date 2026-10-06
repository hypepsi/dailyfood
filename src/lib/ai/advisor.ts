import type { User } from "@/db/schema";
import { renderSnapshot, type Snapshot } from "@/services/snapshot";
import { callModel, type AiMessage } from "./client";
import { CHAT_REPLY, DAILY_ADVICE } from "./prompts";

export async function answerChat(
  user: User,
  snapshot: Snapshot,
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Promise<string> {
  const input: AiMessage[] = [...history, { role: "user", content: message }];
  return callModel({
    user,
    kind: "chat",
    instructions: `${CHAT_REPLY}\n\n【系统数据】\n${renderSnapshot(snapshot)}`,
    input,
    maxOutputTokens: 1500,
  });
}

export async function writeDailyAdvice(user: User, snapshot: Snapshot): Promise<string> {
  const text = await callModel({
    user,
    kind: "advice",
    instructions: `${DAILY_ADVICE}\n\n【系统数据】\n${renderSnapshot(snapshot)}`,
    input: [{ role: "user", content: "给我今天的建议。" }],
    maxOutputTokens: 600,
  });
  return text.trim().slice(0, 200);
}
