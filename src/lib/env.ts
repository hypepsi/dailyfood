import path from "node:path";

function int(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** 所有环境变量集中在这里读取，且只在服务端使用 */
export const env = {
  get dataDir() {
    return path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || "./data");
  },
  get openaiKey() {
    return process.env.OPENAI_API_KEY || "";
  },
  get openaiModel() {
    return process.env.OPENAI_MODEL || "gpt-6-astra";
  },
  get appOrigin() {
    return (process.env.APP_ORIGIN || "").replace(/\/$/, "");
  },
  get imageRetentionDays() {
    return int("IMAGE_RETENTION_DAYS", 90);
  },
  get aiDailyLimit() {
    return int("AI_DAILY_LIMIT", 200);
  },
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
};
