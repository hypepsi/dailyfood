import { z } from "zod";
import { api } from "@/lib/http";
import { log } from "@/lib/logger";

const body = z.object({
  event: z.string().max(40),
  detail: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
});

/** 手机端的几个关键步骤（只记步骤、耗时和状态，不含照片和饮食内容），用来排查“卡住不动”这类问题 */
export const POST = api({ body }, async ({ user, body }) => {
  log.info("client", { userId: user.id, event: body.event, ...body.detail });
  return { ok: true };
});
