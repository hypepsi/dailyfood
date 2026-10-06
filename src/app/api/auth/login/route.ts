import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { clearLoginFailures, createSession, loginBlocked, recordLoginFailure, verifyPassword } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { api } from "@/lib/http";
import { log } from "@/lib/logger";

const body = z.object({ username: z.string().trim().min(1).max(50), password: z.string().min(1).max(200) });

export const POST = api({ body, auth: false }, async ({ req, body }) => {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = `${ip}:${body.username.toLowerCase()}`;
  if (loginBlocked(key)) throw new AppError(429, "too_many_attempts", "尝试次数过多，请 15 分钟后再试");

  const user = getDb().select().from(schema.users).where(eq(schema.users.username, body.username.toLowerCase())).get();
  if (!user || !verifyPassword(body.password, user.passwordHash)) {
    recordLoginFailure(key);
    log.warn("login failed", { ip });
    throw new AppError(401, "bad_credentials", "用户名或密码不正确");
  }
  clearLoginFailures(key);
  await createSession(user.id);
  log.info("login", { userId: user.id });
});
