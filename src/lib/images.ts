import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
import { storage } from "./storage";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAIN_SIZE = 1600;
const THUMB_SIZE = 360;

export type StoredImage = { imagePath: string; thumbPath: string; main: Buffer };

/**
 * 校验并保存上传的食物照片。
 * 不信任文件名和 MIME：由 sharp 实际解码，解不开就拒绝；
 * 重新编码为 WebP，同时去掉 EXIF（含拍摄地点）。
 */
export async function saveMealImage(userId: number, input: Buffer, now = new Date()): Promise<StoredImage> {
  if (input.length === 0) throw new AppError(400, "bad_image", "没有收到图片");
  if (input.length > MAX_UPLOAD_BYTES) throw new AppError(413, "image_too_large", "图片太大了，请换一张");

  let main: Buffer;
  let thumb: Buffer;
  try {
    const base = sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).rotate();
    main = await base
      .clone()
      .resize(MAIN_SIZE, MAIN_SIZE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    thumb = await base.clone().resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" }).webp({ quality: 72 }).toBuffer();
  } catch {
    throw new AppError(400, "bad_image", "无法读取这张图片，请换一张或重新拍摄");
  }

  const dir = `u${userId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const name = randomUUID();
  const imagePath = `${dir}/${name}.webp`;
  const thumbPath = `${dir}/${name}_t.webp`;
  await storage.put(imagePath, main);
  await storage.put(thumbPath, thumb);
  return { imagePath, thumbPath, main };
}

export async function removeImages(...keys: (string | null | undefined)[]) {
  await Promise.all(keys.filter((k): k is string => !!k).map((k) => storage.remove(k)));
}

/**
 * 把上传的截图整理成发给模型的图片（不落盘）。
 * 报告上是小字，保留更高的分辨率和质量。
 */
export async function prepareDocumentImage(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new AppError(400, "bad_image", "没有收到图片");
  if (input.length > MAX_UPLOAD_BYTES) throw new AppError(413, "image_too_large", "图片太大了，请换一张");
  try {
    return await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
  } catch {
    throw new AppError(400, "bad_image", "无法读取这张图片，请换一张");
  }
}
