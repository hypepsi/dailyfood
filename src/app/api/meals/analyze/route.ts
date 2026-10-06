import { analyzeMeal } from "@/lib/ai/analyze-meal";
import { currentModel } from "@/lib/ai/client";
import { badRequest } from "@/lib/errors";
import { api } from "@/lib/http";
import { MAX_UPLOAD_BYTES, removeImages, saveMealImage } from "@/lib/images";
import { isDateString } from "@/lib/time";
import { createDraft } from "@/services/meals";

export const maxDuration = 90;

/** 上传照片和/或文字描述 → AI 估算 → 存为草稿，返回草稿 id 供确认页使用 */
export const POST = api({}, async ({ req, user }) => {
  const form = await req.formData().catch(() => {
    throw badRequest("请求格式不正确");
  });
  const file = form.get("image");
  const text = String(form.get("text") ?? "").trim().slice(0, 500);
  const dateField = String(form.get("date") ?? "");
  const date = isDateString(dateField) ? dateField : undefined;

  const hasImage = file instanceof File && file.size > 0;
  if (!hasImage && !text) throw badRequest("请拍一张照片或描述一下吃了什么");
  if (hasImage && file.size > MAX_UPLOAD_BYTES) throw badRequest("图片太大了，请换一张");

  const stored = hasImage ? await saveMealImage(user.id, Buffer.from(await file.arrayBuffer())) : null;
  try {
    const estimate = await analyzeMeal(user, { image: stored?.main, text: text || undefined });
    const id = createDraft(user, {
      source: stored ? "photo" : "text",
      title: estimate.title,
      items: estimate.items.map(({ confidence: _c, ...item }) => item),
      aiEstimate: { text: text || null, answers: [], estimate },
      aiModel: currentModel(),
      imagePath: stored?.imagePath,
      thumbPath: stored?.thumbPath,
      date,
    });
    return { id };
  } catch (err) {
    // 识别失败时不留下孤儿图片
    await removeImages(stored?.imagePath, stored?.thumbPath);
    throw err;
  }
});
