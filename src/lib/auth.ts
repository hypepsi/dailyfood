import { cache } from "react";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User } from "@/db/schema";
import { env } from "./env";

export { hashPassword, verifyPassword } from "./auth-password";

const COOKIE = "lw_session";
const SESSION_MS = 365 * 86400_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 数据库只存 token 的哈希，泄露数据库也无法伪造登录 */
export async function createSession(userId: number) {
  const db = getDb();
  const now = Date.now();
  const token = randomBytes(32).toString("base64url");
  db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now)).run();
  db.insert(schema.sessions)
    .values({ tokenHash: hashToken(token), userId, expiresAt: now + SESSION_MS, createdAt: now })
    .run();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token))).run();
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .select({ user: schema.users, expiresAt: schema.sessions.expiresAt })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, hashToken(token)))
    .get();
  if (!row || row.expiresAt < Date.now()) return null;
  return row.user;
});

/** 简单的内存登录限流：同一来源 15 分钟内最多 8 次失败 */
const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

export function loginBlocked(key: string): boolean {
  const f = failures.get(key);
  return !!f && f.resetAt > Date.now() && f.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || f.resetAt < now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else f.count += 1;
}

export const clearLoginFailures = (key: string) => failures.delete(key);
