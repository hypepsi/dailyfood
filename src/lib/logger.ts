type Fields = Record<string, unknown>;

function write(level: "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

function errFields(err: unknown): Fields {
  if (err instanceof Error) return { err: err.message, stack: err.stack };
  return { err: String(err) };
}

/** 单行 JSON 日志，由 systemd/journald 收集 */
export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, err?: unknown, fields?: Fields) =>
    write("error", msg, { ...fields, ...(err === undefined ? {} : errFields(err)) }),
};
