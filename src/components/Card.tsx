import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  /** 右上角的次要入口，如「历史」 */
  action?: { href: string; label: string; icon?: LucideIcon };
  children: React.ReactNode;
};

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="icon-tile">
      <Icon size={18} strokeWidth={2.5} />
    </span>
  );
}

/** 通用卡片：图标 + 标题 + 右上角入口 */
export function Card({ icon, title, action, children }: Props) {
  return (
    <section className="card">
      <header className="mb-3 flex items-center gap-2.5 lg:mb-4">
        <IconTile icon={icon} />
        <h2 className="flex-1 text-[17px] font-bold lg:text-lg">{title}</h2>
        {action && (
          <Link href={action.href} className="flex items-center gap-1 py-1 pl-3 text-[13px] font-medium text-muted transition-colors hover:text-accent active:text-ink">
            {action.icon && <action.icon size={14} />}
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
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div className={`num text-[2.25rem] font-extrabold leading-tight tracking-tight lg:text-[2.6rem] ${tone === "warn" ? "text-warn" : "text-accent-deep"}`}>
        {value}
        {unit && <span className="ml-1 text-base font-bold">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[13px] text-muted">{sub}</div>}
    </div>
  );
}

/** 卡片底部的两三个小统计 */
export function StatRow({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <dl className="mt-3 flex border-t border-line pt-3 lg:mt-4 lg:pt-4">
      {stats.map((s) => (
        <div key={s.label} className="flex-1">
          <dt className="text-xs font-medium text-muted">{s.label}</dt>
          <dd className="num mt-0.5 text-base font-bold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="mt-3 h-2.5 overflow-hidden rounded-full bg-track"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className={`bar-fill h-full rounded-full ${over ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
