"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, CircleCheck, House, MessageCircle, Scale, UserRound } from "lucide-react";

const TABS = [
  { href: "/", label: "今天", icon: House, match: (p: string) => p === "/" || p.startsWith("/day") || p.startsWith("/meal") },
  { href: "/trends", label: "趋势", icon: ChartNoAxesColumn, match: (p: string) => p.startsWith("/trends") },
  { href: "/weight", label: "身体数据", icon: Scale, match: (p: string) => p.startsWith("/weight"), desktopOnly: true },
  { href: "/chat", label: "问 AI", icon: MessageCircle, match: (p: string) => p.startsWith("/chat") },
  { href: "/settings", label: "我的", icon: UserRound, match: (p: string) => p.startsWith("/settings") },
];

/** 导航：手机上是底部标签栏，电脑上是左侧边栏 */
export function AppNav() {
  const pathname = usePathname();
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-md">
          {TABS.filter((t) => !t.desktopOnly).map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] ${active ? "font-semibold text-accent" : "text-faint"}`}
                >
                  <tab.icon size={22} strokeWidth={active ? 2.4 : 2} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-card px-4 py-7 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-3 text-xl font-bold text-accent-deep">
          <CircleCheck size={26} className="text-accent" />
          LoseWeight
        </Link>
        <ul className="space-y-1">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-base transition-colors ${
                    active ? "bg-tint font-semibold text-accent-deep" : "text-muted hover:bg-bg hover:text-ink"
                  }`}
                >
                  <tab.icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? "text-accent" : ""} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
