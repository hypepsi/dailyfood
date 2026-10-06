import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** 部署脚本和监控用的健康检查：确认进程在跑、数据库可读 */
export function GET() {
  try {
    getDb().get(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("health check failed", err);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
