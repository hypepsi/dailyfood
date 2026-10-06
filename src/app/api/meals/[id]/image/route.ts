import { notFound } from "@/lib/errors";
import { api, idParam } from "@/lib/http";
import { storage } from "@/lib/storage";
import { getMealRow } from "@/services/meals";

/** 图片只能由所属用户读取，不提供公开的静态路径 */
export const GET = api({}, async ({ req, user, params }) => {
  const meal = getMealRow(user, idParam(params.id));
  const wantThumb = req.nextUrl.searchParams.get("size") === "thumb";
  // 原图过期清理后回退到缩略图
  const candidates = wantThumb ? [meal.thumbPath] : [meal.imagePath, meal.thumbPath];
  for (const key of candidates) {
    const data = key ? await storage.read(key) : null;
    if (data) {
      return new Response(new Uint8Array(data), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=604800, immutable" },
      });
    }
  }
  throw notFound("图片");
});
