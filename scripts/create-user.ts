/**
 * 创建用户或重置密码：
 *   npm run user:create -- <用户名> [显示名]
 * 密码随机生成并只打印一次。用户已存在时只重置密码。
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { hashPassword } from "../src/lib/auth-password";
import { defaultProteinTarget } from "../src/lib/nutrition";

const [username, displayName] = process.argv.slice(2);
if (!username) {
  console.error("用法: npm run user:create -- <用户名> [显示名]");
  process.exit(1);
}

const db = getDb();
const name = username.toLowerCase();
const password = randomBytes(9).toString("base64url");
const now = Date.now();
const existing = db.select().from(schema.users).where(eq(schema.users.username, name)).get();

if (existing) {
  db.update(schema.users).set({ passwordHash: hashPassword(password), updatedAt: now }).where(eq(schema.users.id, existing.id)).run();
  db.delete(schema.sessions).where(eq(schema.sessions.userId, existing.id)).run();
  console.log(`已重置密码\n用户名: ${name}\n新密码: ${password}`);
} else {
  // 新用户的通用默认值，登录后在「我的」里修改
  const targetWeightKg = null;
  db.insert(schema.users)
    .values({
      username: name,
      passwordHash: hashPassword(password),
      displayName: displayName || name,
      calorieTarget: 2000,
      proteinTargetG: defaultProteinTarget(70),
      targetWeightKg,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  console.log(`已创建用户\n用户名: ${name}\n密码: ${password}`);
}
