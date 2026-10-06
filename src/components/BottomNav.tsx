"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, House, MessageCircle, UserRound } from "lucide-react";

const TABS = [
  { href: "/", label: "今天", icon: House, match: (p: string) => p === "/" || p.startsWith("/day") },
  { href: "/trends", label: "趋势", icon: ChartNoAxesColumn, match: (p: string) => p.startsWith("/trends") },
  { href: "/chat", label: "问 AI", icon: MessageCircle, match: (p: string) => p.startsWith("/chat") },
  { href: "/settings", label: "我的", icon: UserRound, match: (p: string) => p.startsWith("/settings") },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
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
  );
}
