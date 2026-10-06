import { readBodyReport } from "@/lib/ai/read-body-report";
import { badRequest } from "@/lib/errors";
import { api } from "@/lib/http";
import { prepareDocumentImage } from "@/lib/images";
import { recordReport } from "@/services/metrics";

export const maxDuration = 90;

/** 上传体脂秤报告截图 → AI 抄录数值 → 程序校验 → 直接入库。截图本身不保存 */
export const POST = api({}, async ({ req, user }) => {
  const form = await req.formData().catch(() => {
    throw badRequest("请求格式不正确");
  });
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) throw badRequest("请选择一张报告截图");

  const image = await prepareDocumentImage(Buffer.from(await file.arrayBuffer()));
  const report = await readBodyReport(user, image);
  const saved = recordReport(user, report);
  return { ...saved, core: report.core, extra: report.extra, warnings: report.warnings };
});
