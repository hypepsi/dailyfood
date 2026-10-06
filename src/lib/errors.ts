/** 可以安全展示给用户的错误；其他异常一律对外显示为通用提示 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "记录") => new AppError(404, "not_found", `${what}不存在`);
export const badRequest = (message: string) => new AppError(400, "bad_request", message);
