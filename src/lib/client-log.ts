/** 把关键步骤发给服务器写进日志；失败无所谓，不影响使用 */
export function clientLog(event: string, detail: Record<string, string | number | boolean | null> = {}) {
  try {
    fetch("/api/client-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}
