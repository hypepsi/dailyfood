/**
 * 每日维护（由 systemd timer 触发，也可手动 npm run maintenance）：
 * 1. 备份数据库，保留最近 14 份
 * 2. 清理超过 24 小时未确认的草稿及其图片
 * 3. 超过保留期的原图只留缩略图
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { env } from "../src/lib/env";
import { removeImages } from "../src/lib/images";
import { log } from "../src/lib/logger";
import { purgeStaleDrafts } from "../src/services/meals";

const BACKUPS_TO_KEEP = 14;

async function backupDatabase() {
  const dir = path.join(env.dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  // 文件名用服务器本地日期（toISOString 是 UTC，凌晨跑的任务会被标成前一天）
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const target = path.join(dir, `loseweight-${stamp}.db`);
  const source = new Database(path.join(env.dataDir, "loseweight.db"), { readonly: true });
  await source.backup(target);
  source.close();
  const old = fs.readdirSync(dir).filter((f) => /^loseweight-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -BACKUPS_TO_KEEP);
  for (const f of old) fs.rmSync(path.join(dir, f));
  log.info("backup done", { target, removed: old.length });
}

async function cleanDrafts() {
  const images = purgeStaleDrafts();
  await removeImages(...images);
  log.info("stale drafts purged", { images: images.length });
}

async function expireOriginals() {
  const db = getDb();
  const cutoff = Date.now() - env.imageRetentionDays * 86400_000;
  const expired = db
    .select({ id: schema.mealImages.id, imagePath: schema.mealImages.imagePath })
    .from(schema.mealImages)
    .innerJoin(schema.meals, eq(schema.meals.id, schema.mealImages.mealId))
    .where(and(eq(schema.meals.status, "confirmed"), isNotNull(schema.mealImages.imagePath), lt(schema.meals.eatenAt, cutoff)))
    .all();
  for (const image of expired) {
    await removeImages(image.imagePath);
    db.update(schema.mealImages).set({ imagePath: null }).where(eq(schema.mealImages.id, image.id)).run();
  }
  log.info("original images expired", { count: expired.length, retentionDays: env.imageRetentionDays });
}

async function main() {
  getDb();
  await backupDatabase();
  await cleanDrafts();
  await expireOriginals();
}

main().catch((err) => {
  log.error("maintenance failed", err);
  process.exit(1);
});
