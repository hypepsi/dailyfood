import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  /** 右上角的次要入口，如「历史」 */
  action?: { href: string; label: string; icon?: LucideIcon };
  children: React.ReactNode;
};

/** 首页和各页面通用的卡片：图标 + 标题 + 右上角入口 */
export function Card({ icon: Icon, title, action, children }: Props) {
  return (
    <section className="rounded-[28px] border border-line bg-card p-5 shadow-card">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tint text-accent">
          <Icon size={22} strokeWidth={2} />
        </span>
        <h2 className="flex-1 text-lg font-semibold">{title}</h2>
        {action && (
          <Link href={action.href} className="flex items-center gap-1 py-2 pl-3 text-sm text-faint active:text-ink">
            {action.icon && <action.icon size={15} />}
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** 卡片里的主数字 */
export function BigStat({
  label,
  value,
  unit,
  tone = "accent",
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "accent" | "warn";
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm text-faint">{label}</div>
      <div className={`num mt-1 text-[40px] font-bold leading-tight ${tone === "warn" ? "text-warn" : "text-accent-deep"}`}>
        {value}
        {unit && <span className="ml-1.5 text-xl font-semibold">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
    </div>
  );
}

/** 卡片底部的两三个小统计 */
export function StatRow({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <dl className="mt-4 flex border-t border-line pt-4">
      {stats.map((s) => (
        <div key={s.label} className="flex-1">
          <dt className="text-xs text-faint">{s.label}</dt>
          <dd className="num mt-1 text-[17px] font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="mt-4 h-2.5 overflow-hidden rounded-full bg-tint"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className={`h-full rounded-full ${over ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
