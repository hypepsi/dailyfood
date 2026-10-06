import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

const globalRef = globalThis as unknown as { __lwDb?: Db };

/** 打开数据库并应用未执行的迁移。path 传 ":memory:" 用于测试 */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export function getDb(): Db {
  if (!globalRef.__lwDb) {
    globalRef.__lwDb = openDb(path.join(env.dataDir, "loseweight.db"));
  }
  return globalRef.__lwDb;
}

/** 仅测试使用 */
export function setDbForTests(db: Db) {
  globalRef.__lwDb = db;
}

export { schema };
