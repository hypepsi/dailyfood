import { MAX_MEAL_PHOTOS } from "@/db/schema";
import { analyzeMeal } from "@/lib/ai/analyze-meal";
import { currentModel, transcribeAudio } from "@/lib/ai/client";
import { MEAL_PROMPT_VERSION, VOICE_TRANSCRIBE_HINT } from "@/lib/ai/prompts";
import { AppError, badRequest } from "@/lib/errors";
import { api } from "@/lib/http";
import { MAX_UPLOAD_BYTES, removeImages, saveMealImage, type StoredImage } from "@/lib/images";
import { isDateString } from "@/lib/time";
import { createDraft, mealTypeOf } from "@/services/meals";

export const maxDuration = 120;

const isFile = (value: unknown): value is File => value instanceof File && value.size > 0;

/**
 * 三种记录方式共用一个入口：照片（一张或多张）、语音、文字，可以同时带。
 * 语音先转成文字，之后和打字描述走同一条路：AI 估算 → 存为草稿 → 返回草稿 id 供确认页使用。
 */
export const POST = api({}, async ({ req, user }) => {
  const form = await req.formData().catch(() => {
    throw badRequest("请求格式不正确");
  });
  const photos = form.getAll("image").filter(isFile);
  const audio = form.get("audio");
  const dateField = String(form.get("date") ?? "");
  const date = isDateString(dateField) ? dateField : undefined;
  // 从某一餐的入口进来时带着餐次
  const chosenMealType = mealTypeOf(String(form.get("mealType") ?? ""));

  let text = String(form.get("text") ?? "").trim().slice(0, 500);
  if (isFile(audio)) {
    text = (await transcribeAudio(user, { data: Buffer.from(await audio.arrayBuffer()), mimeType: audio.type }, VOICE_TRANSCRIBE_HINT)).slice(0, 500);
    if (text.length < 2) throw new AppError(422, "no_speech", "没有听清，请靠近手机再说一次");
  }
  if (photos.length === 0 && !text) throw badRequest("请拍一张照片，或说一下、写一下吃了什么");
  if (photos.length > MAX_MEAL_PHOTOS) throw badRequest(`一次最多 ${MAX_MEAL_PHOTOS} 张照片`);
  if (photos.some((p) => p.size > MAX_UPLOAD_BYTES)) throw badRequest("有图片太大了，请换一张");

  const stored: StoredImage[] = [];
  const cleanUp = () => removeImages(...stored.flatMap((s) => [s.imagePath, s.thumbPath]));
  try {
    for (const photo of photos) stored.push(await saveMealImage(user.id, Buffer.from(await photo.arrayBuffer())));
    const estimate = await analyzeMeal(user, { images: stored.map((s) => s.main), text: text || undefined });
    const id = createDraft(user, {
      source: stored.length ? "photo" : isFile(audio) ? "voice" : "text",
      title: estimate.title,
      items: estimate.items.map(({ confidence: _c, ...item }) => item),
      aiEstimate: { text: text || null, answers: [], promptVersion: MEAL_PROMPT_VERSION, style: user.estimateStyle, estimate },
      aiModel: currentModel(),
      images: stored,
      people: estimate.peopleStated,
      mealType: chosenMealType ?? estimate.mealTypeStated,
      date,
    });
    return { id };
  } catch (err) {
    // 识别失败时不留下孤儿图片
    await cleanUp();
    // 让用户看到刚才听到了什么，方便判断是没听清还是没说食物
    if (err instanceof AppError && err.code === "no_food" && isFile(audio)) {
      throw new AppError(422, "no_food", `听到的是「${text.slice(0, 60)}」，里面没有找到食物，请再说一次`);
    }
    throw err;
  }
});
