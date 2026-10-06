import { z } from "zod";
import { interpretAdjustment } from "@/lib/ai/adjust-meal";
import { transcribeAudio } from "@/lib/ai/client";
import { ADJUST_TRANSCRIBE_HINT } from "@/lib/ai/prompts";
import { AppError, badRequest } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { getMealRow } from "@/services/meals";

export const maxDuration = 90;

const itemsSchema = z.array(z.object({ name: z.string().trim().min(1).max(60), quantity: z.string().max(30).default("") })).min(1).max(30);

/**
 * 把一句话（语音或文字）理解成每样食物实际吃掉的比例。
 * 只返回建议，不保存：由编辑页应用到界面上，用户点「保存修改」才生效。
 * 清单由前端传来，这样和用户眼前（可能还没保存）的明细一一对应。
 */
export const POST = api({}, async ({ req, user, params }) => {
  getMealRow(user, idParam(params.id));
  const form = await req.formData().catch(() => {
    throw badRequest("请求格式不正确");
  });
  let items: z.infer<typeof itemsSchema>;
  try {
    items = itemsSchema.parse(JSON.parse(String(form.get("items") ?? "")));
  } catch {
    throw badRequest("食物清单不正确");
  }

  const audio = form.get("audio");
  let statement = String(form.get("text") ?? "").trim().slice(0, 300);
  if (audio instanceof File && audio.size > 0) {
    statement = (await transcribeAudio(user, { data: Buffer.from(await audio.arrayBuffer()), mimeType: audio.type }, ADJUST_TRANSCRIBE_HINT)).slice(0, 300);
    if (statement.length < 2) throw new AppError(422, "no_speech", "没有听清，请靠近手机再说一次");
  }
  if (!statement) throw badRequest("请说一下或写一下实际吃了多少");

  const adjustment = await interpretAdjustment(user, items, statement);
  return { heard: statement, ...adjustment };
});
