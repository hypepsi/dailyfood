import { z } from "zod";
import { editMeal, type MealEdit } from "@/lib/ai/edit-meal";
import { AppError, badRequest } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { MAX_UPLOAD_BYTES, removeImages, saveMealImage } from "@/lib/images";
import { addMealImage, getMealImages, getMealRow } from "@/services/meals";
import { MAX_MEAL_PHOTOS } from "@/db/schema";

export const maxDuration = 120;

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
  .max(30);

/**
 * 给一顿饭补拍一张照片。
 * 照片立刻保存；同时让 AI 对照当前清单看这张照片，
 * 返回“要补哪些、要改哪些”的方案（不保存，由编辑页应用，用户确认后才生效）。
 */
export const POST = api({}, async ({ req, user, params }) => {
  const mealId = idParam(params.id);
  getMealRow(user, mealId);
  if (getMealImages(mealId).length >= MAX_MEAL_PHOTOS) throw new AppError(409, "too_many_photos", `一顿饭最多 ${MAX_MEAL_PHOTOS} 张照片`);

  const form = await req.formData().catch(() => {
    throw badRequest("请求格式不正确");
  });
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) throw badRequest("请选择一张照片");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("图片太大了，请换一张");
  let items: z.infer<typeof itemsSchema>;
  try {
    items = itemsSchema.parse(JSON.parse(String(form.get("items") ?? "[]")));
  } catch {
    throw badRequest("食物清单不正确");
  }

  const stored = await saveMealImage(user.id, Buffer.from(await file.arrayBuffer()));
  let photoCount: number;
  try {
    photoCount = addMealImage(user, mealId, stored);
  } catch (err) {
    await removeImages(stored.imagePath, stored.thumbPath);
    throw err;
  }

  // 照片已经存好了；AI 这一步失败或没发现新东西，都不影响照片本身
  let edit: MealEdit | null = null;
  let note = "";
  try {
    edit = await editMeal(user, items, "补拍了一张照片，请对照清单看看有没有漏掉或需要修正的。", { images: [stored.main] });
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    note = err.code === "not_understood" ? "照片已添加，里面没有发现清单以外的食物。" : "照片已添加，但这次没能识别，请手动补充或稍后再试。";
  }
  return { photoCount, edit, note };
});
