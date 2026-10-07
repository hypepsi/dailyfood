import { notFound } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { storage } from "@/lib/storage";
import { getMealImages, getMealRow } from "@/services/meals";

/**
 * 读取一顿饭的第 n 张照片（n 从 0 开始，默认第一张）。
 * 图片只能由所属用户读取，不提供公开的静态路径。
 */
export const GET = api({}, async ({ req, user, params }) => {
  const meal = getMealRow(user, idParam(params.id));
  const n = Number(req.nextUrl.searchParams.get("n") ?? "0");
  const image = getMealImages(meal.id)[Number.isInteger(n) && n >= 0 ? n : 0];
  if (!image) throw notFound("图片");
  const wantThumb = req.nextUrl.searchParams.get("size") === "thumb";
  // 原图过期清理后回退到缩略图
  for (const key of wantThumb ? [image.thumbPath] : [image.imagePath, image.thumbPath]) {
    const data = key ? await storage.read(key) : null;
    if (data) {
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800, immutable" },
      });
    }
  }
  throw notFound("图片");
});
