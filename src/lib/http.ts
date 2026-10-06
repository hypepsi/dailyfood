import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { User } from "@/db/schema";
import { getCurrentUser } from "./auth";
import { AppError } from "./errors";
import { env } from "./env";
import { log } from "./logger";

type RouteCtx = { params: Promise<Record<string, string | string[]>> };

type HandlerArgs<B> = {
  req: NextRequest;
  user: User;
  body: B;
  params: Record<string, string>;
};

type Options<S extends z.ZodType | undefined> = {
  /** JSON 请求体的校验规则；multipart 接口不传，自己读 formData */
  body?: S;
  /** 登录接口等少数场景设为 false */
  auth?: boolean;
};

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // 非浏览器或同源 GET
  if (env.appOrigin && origin === env.appOrigin) return true;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * 所有 API 路由的统一入口：来源校验、登录校验、输入校验、错误处理和日志。
 * 未知异常只记日志，不把内部细节返回给前端。
 */
export function api<S extends z.ZodType | undefined = undefined>(
  options: Options<S>,
  handler: (args: HandlerArgs<S extends z.ZodType ? z.infer<S> : undefined>) => Promise<unknown> | unknown,
) {
  return async (req: NextRequest, ctx: RouteCtx) => {
    const requestId = randomUUID().slice(0, 8);
    const started = Date.now();
    const route = `${req.method} ${req.nextUrl.pathname}`;
    try {
      if (req.method !== "GET" && !sameOrigin(req)) {
        throw new AppError(403, "forbidden", "请求来源不合法");
      }
      let user: User | null = null;
      if (options.auth !== false) {
        user = await getCurrentUser();
        if (!user) throw new AppError(401, "unauthorized", "请先登录");
      }
      let body: unknown = undefined;
      if (options.body) {
        const raw = await req.json().catch(() => {
          throw new AppError(400, "bad_request", "请求格式不正确");
        });
        body = options.body.parse(raw);
      }
      const rawParams = (await ctx?.params) ?? {};
      const params = Object.fromEntries(
        Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]),
      );
      const result = await handler({ req, user: user as User, body: body as never, params });
      if (req.method !== "GET") {
        log.info("api", { route, requestId, userId: user?.id, ms: Date.now() - started });
      }
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        log.warn("api rejected", { route, requestId, code: err.code, status: err.status });
        return errorResponse(err.status, err.code, err.message);
      }
      if (err instanceof z.ZodError) {
        const first = err.issues[0];
        log.warn("api invalid input", { route, requestId, path: first?.path.join(".") });
        return errorResponse(400, "invalid_input", "输入内容有误，请检查后重试");
      }
      log.error("api failed", err, { route, requestId });
      return errorResponse(500, "internal", `服务器出错了，请稍后再试（${requestId}）`);
    }
  };
}

export function idParam(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(404, "not_found", "记录不存在");
  return n;
}
