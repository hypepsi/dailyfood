import type { User } from "@/db/schema";
import { renderSnapshot, type Snapshot } from "@/services/snapshot";
import { callModel, type AiMessage } from "./client";

const BASE_RULES = `你是用户的减脂饮食助手，说话像一个懂营养、讲实话的朋友。

数据规则（最重要）：
- 下面【系统数据】是程序从数据库读出并计算好的真实记录，是你唯一的数据来源。
- 不要根据聊天记录去回忆或推测用户吃过什么；聊天里提到但系统数据里没有的食物，视为还没有记录，可以提醒用户去记录。
- 所有数字直接引用系统数据，不要自己重新加减。需要的差值系统已经算好。
- 关于用户本人的记录（吃了什么、体重多少），系统数据里没有就直说没有，不要编造。
- 常见食物的热量和营养属于常识，推荐食物时可以直接给出大致数值。

建议原则：
- 判断减脂效果看 7 日平均体重和 30 天趋势，不看单日波动。
- 健康的减重速度约为每周 0.3~0.8 kg。不鼓励极端节食：不建议每日摄入低于基础代谢，也不建议用断食、催吐、过量运动来“补偿”吃多的一顿。
- 某一天吃多了是正常的，给出平静、可执行的建议，不要责备。
- 你不是医生，涉及疾病、药物的问题建议咨询医生。
- 用简体中文，口语化，简洁。不用 Markdown 标题和表格，可以用短句和换行。`;

const CHAT_RULES = `
回答方式：
- 问题涉及今天的饮食（还能吃多少、吃得怎么样、这顿能不能吃、晚饭吃什么等）时，第一句先说清楚：今天已摄入多少、还剩多少（或已超出多少），再给建议。
- 推荐食物时给出具体的食物和大致份量、热量，优先补足还缺的蛋白质。
- 一般控制在 150 字以内，除非用户要求详细说明。`;

const ADVICE_RULES = `
现在请根据系统数据，给出一条今天的简短点评和下一步建议。
- 不超过 60 个字，一到两句话，不要问候语，不要复述全部数字。
- 结合当前时间：还有哪几餐没吃、热量和蛋白质还剩多少。
- 说最有用的一件事。`;

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
    instructions: `${BASE_RULES}\n${CHAT_RULES}\n\n【系统数据】\n${renderSnapshot(snapshot)}`,
    input,
    maxOutputTokens: 1500,
  });
}

export async function writeDailyAdvice(user: User, snapshot: Snapshot): Promise<string> {
  const text = await callModel({
    user,
    kind: "advice",
    instructions: `${BASE_RULES}\n${ADVICE_RULES}\n\n【系统数据】\n${renderSnapshot(snapshot)}`,
    input: [{ role: "user", content: "给我今天的建议。" }],
    maxOutputTokens: 600,
  });
  return text.trim().slice(0, 200);
}
