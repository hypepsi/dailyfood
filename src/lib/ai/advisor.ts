import type { User } from "@/db/schema";
import { renderSnapshot, type Snapshot } from "@/services/snapshot";
import { callModel } from "./client";
import { DAILY_ADVICE } from "./prompts";

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
