/** 浏览器端调用后端接口的小工具：统一处理错误提示和登录过期 */
export async function request<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body instanceof FormData || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("网络连接失败，请检查网络后重试");
  }
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.location.href = "/login";
    throw new Error("请先登录");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message || "操作失败，请稍后再试");
  return data as T;
}

/** 文本框里的数字：空或非法返回 null */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
