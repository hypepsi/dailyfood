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
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-tint text-accent lg:h-10 lg:w-10 lg:rounded-2xl">
      <Icon size={17} strokeWidth={2.2} />
    </span>
  );
}

/** 通用卡片：图标 + 标题 + 右上角入口 */
export function Card({ icon, title, action, children }: Props) {
  return (
    <section className="rounded-3xl border border-line bg-card p-4 shadow-card lg:p-6">
      <header className="mb-3 flex items-center gap-2.5 lg:mb-4">
        <IconTile icon={icon} />
        <h2 className="flex-1 text-base font-semibold lg:text-lg">{title}</h2>
        {action && (
          <Link href={action.href} className="flex items-center gap-1 py-1 pl-3 text-[13px] text-faint active:text-ink">
            {action.icon && <action.icon size={14} />}
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** 首页并排的半宽卡片：一个标题、一个大数字、一条进度、一行说明 */
export function MiniCard({
  icon,
  title,
  href,
  label,
  value,
  unit,
  tone = "accent",
  progress,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  href: string;
  label: string;
  value: string;
  unit: string;
  tone?: "accent" | "warn";
  progress: { value: number; max: number };
  footer: string;
}) {
  return (
    <Link href={href} className="block rounded-3xl border border-line bg-card p-4 shadow-card transition-shadow active:bg-bg lg:p-6 lg:hover:shadow-lg">
      <div className="flex items-center gap-2">
        <IconTile icon={icon} />
        <h2 className="text-base font-semibold lg:text-lg">{title}</h2>
      </div>
      <div className="mt-3 text-[13px] text-faint">{label}</div>
      <div className={`num text-[2rem] font-bold leading-tight tracking-tight lg:text-[2.5rem] ${tone === "warn" ? "text-warn" : "text-accent-deep"}`}>
        {value}
        <span className="ml-1 text-sm font-semibold">{unit}</span>
      </div>
      <ProgressBar {...progress} over={tone === "warn"} />
      <div className="num mt-2 text-[13px] text-muted">{footer}</div>
    </Link>
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
      <div className="text-[13px] text-faint">{label}</div>
      <div className={`num text-[2.1rem] font-bold leading-tight tracking-tight lg:text-[2.5rem] ${tone === "warn" ? "text-warn" : "text-accent-deep"}`}>
        {value}
        {unit && <span className="ml-1 text-base font-semibold">{unit}</span>}
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
          <dt className="text-xs text-faint">{s.label}</dt>
          <dd className="num mt-0.5 text-[15px] font-semibold">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="mt-2.5 h-2 overflow-hidden rounded-full bg-tint"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className={`h-full rounded-full ${over ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
