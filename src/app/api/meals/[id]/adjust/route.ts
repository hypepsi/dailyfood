import { z } from "zod";
import { transcribeAudio } from "@/lib/ai/client";
import { editMeal } from "@/lib/ai/edit-meal";
import { ADJUST_TRANSCRIBE_HINT } from "@/lib/ai/prompts";
import { AppError, badRequest } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { getMealRow } from "@/services/meals";

export const maxDuration = 90;

const number = (max: number) => z.number().min(0).max(max).catch(0);
const itemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(60),
      quantity: z.string().max(30).default(""),
      weightG: z.number().min(0).max(5000).nullable().catch(null),
      kcal: number(10000),
      proteinG: number(1000),
      carbsG: number(1000),
      fatG: number(1000),
    }),
  )
  .min(1)
  .max(30);

/**
 * 用一句话（语音或文字）修改一顿饭：认错了、漏了、多了、没吃完都可以。
 * 只返回修改方案，不保存：由编辑页应用到界面上，用户点保存才生效。
 * 清单由前端传来，这样和用户眼前（可能还没保存）的明细一一对应。
 * 草稿和已确认的记录都可以用。
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
  if (!statement) throw badRequest("请说一下或写一下哪里不对");

  try {
    // 用户点着某一样食物说的时候，前端会带上它在清单里的位置
    const target = Number(form.get("target"));
    const focus = form.get("target") !== null && Number.isInteger(target) && target >= 0 && target < items.length ? target : undefined;
    const edit = await editMeal(user, items, statement, { focus });
    return { heard: statement, ...edit };
  } catch (err) {
    // 把听到的内容告诉用户，方便判断是语音没听清，还是这句话确实不好理解
    if (err instanceof AppError && err.code === "not_understood") {
      throw new AppError(422, "not_understood", `听到的是「${statement.slice(0, 50)}」，${err.message}。请说得具体一点，例如哪样食物、改成什么`);
    }
    throw err;
  }
});
